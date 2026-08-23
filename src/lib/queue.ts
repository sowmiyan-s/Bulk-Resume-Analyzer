/**
 * Rate-limited async queue with concurrency, cooldown and auto-retry.
 * Custom implementation (no p-queue dep) because we need per-item status
 * callbacks and a cooldown gate that applies *between* dispatches.
 */

export type QueueOptions = {
  concurrency: number;
  /** Seconds to wait between dispatching tasks. */
  cooldownSec: number;
  maxRetries: number;
  /** Base backoff seconds; grows exponentially per attempt. */
  retryBackoffSec: number;
};

export type TaskContext = {
  attempt: number;
  signal: AbortSignal;
};

export type TaskHandlers<T> = {
  onStart?: (id: string, attempt: number) => void;
  onSuccess?: (id: string, value: T) => void;
  onError?: (id: string, message: string, willRetry: boolean, retryInSec: number) => void;
  onRetryWait?: (id: string, secondsLeft: number) => void;
  onCooldown?: (secondsLeft: number) => void;
  onIdle?: () => void;
};

export type Task<T> = {
  id: string;
  run: (ctx: TaskContext) => Promise<T>;
  /** Non-retryable failures short-circuit the retry loop. */
  isRetryable?: (error: unknown) => boolean;
};

export class RateLimitedQueue<T> {
  private controller = new AbortController();
  private stopped = false;
  private active = 0;
  private pending: Task<T>[] = [];
  private lastDispatch = 0;
  private running = false;

  constructor(
    private opts: QueueOptions,
    private handlers: TaskHandlers<T> = {},
  ) {}

  get signal() {
    return this.controller.signal;
  }

  update(opts: Partial<QueueOptions>) {
    this.opts = { ...this.opts, ...opts };
  }

  add(tasks: Task<T>[]) {
    this.pending.push(...tasks);
  }

  stop() {
    this.stopped = true;
    this.pending = [];
    this.controller.abort();
  }

  private sleep(ms: number, tick?: (leftMs: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const end = Date.now() + ms;
      const step = () => {
        if (this.stopped) return resolve();
        const left = end - Date.now();
        if (left <= 0) return resolve();
        tick?.(left);
        setTimeout(step, Math.min(200, left));
      };
      step();
    });
  }

  /** Runs everything currently queued, honouring concurrency + cooldown. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    this.controller = new AbortController();

    const workers: Promise<void>[] = [];
    const spawn = async () => {
      while (!this.stopped) {
        const task = this.pending.shift();
        if (!task) break;

        // Cooldown gate: space out dispatches across all workers.
        const gap = this.opts.cooldownSec * 1000;
        if (gap > 0) {
          const since = Date.now() - this.lastDispatch;
          if (this.lastDispatch && since < gap) {
            await this.sleep(gap - since, (left) =>
              this.handlers.onCooldown?.(Math.ceil(left / 1000)),
            );
            this.handlers.onCooldown?.(0);
          }
        }
        if (this.stopped) break;
        this.lastDispatch = Date.now();

        this.active++;
        await this.execute(task);
        this.active--;
      }
    };

    for (let i = 0; i < Math.max(1, this.opts.concurrency); i++) workers.push(spawn());
    await Promise.all(workers);

    this.running = false;
    if (!this.stopped) this.handlers.onIdle?.();
  }

  private async execute(task: Task<T>) {
    for (let attempt = 1; attempt <= this.opts.maxRetries + 1; attempt++) {
      if (this.stopped) return;
      this.handlers.onStart?.(task.id, attempt);
      try {
        const value = await task.run({ attempt, signal: this.controller.signal });
        if (this.stopped) return;
        this.handlers.onSuccess?.(task.id, value);
        return;
      } catch (error) {
        if (this.stopped) return;
        const message = error instanceof Error ? error.message : String(error);
        const allowed = task.isRetryable ? task.isRetryable(error) : true;
        const willRetry = allowed && attempt <= this.opts.maxRetries;
        let waitSec = willRetry ? this.opts.retryBackoffSec * Math.pow(2, attempt - 1) : 0;

        // If rate limit error contains specific time instruction, honor it
        const isRateLimit = message.includes("429") || /rate[- ]limit/i.test(message);
        if (isRateLimit && willRetry) {
          const match = message.match(/try again in ([0-9.]+)\s*(s|ms|seconds)/i);
          if (match && match[1] && match[2]) {
            const num = parseFloat(match[1]);
            const unit = match[2].toLowerCase();
            waitSec = unit === "ms" ? Math.max(2, Math.ceil(num / 1000) + 1) : Math.max(2, Math.ceil(num) + 1);
          } else {
            waitSec = Math.max(5, waitSec);
          }
          // Cooldown the dispatch gate for other parallel workers
          this.lastDispatch = Date.now() + waitSec * 1000;
        }

        this.handlers.onError?.(task.id, message, willRetry, waitSec);
        if (!willRetry) return;

        await this.sleep(waitSec * 1000, (left) =>
          this.handlers.onRetryWait?.(task.id, Math.ceil(left / 1000)),
        );
      }
    }
  }
}
