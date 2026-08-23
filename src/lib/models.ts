/**
 * Multi-model registry for Groq, Cerebras, Google Gemini, OpenRouter (:free), Local Ollama,
 * NVIDIA NIM, LiteLLM, and OpenAI-compatible endpoints.
 * Curated specifically for 100% PERMANENT FREE endpoints with massive rate limits (100+ non-stop screening).
 */

export type ProviderId =
  | "groq"
  | "cerebras"
  | "gemini"
  | "openrouter"
  | "ollama"
  | "nvidia"
  | "litellm"
  | "openai-compatible";

export type ModelTag =
  | "High Speed"
  | "Recommended"
  | "High Rate Limit"
  | "Deep Reasoning"
  | "Code & Tech"
  | "Unlimited Offline"
  | "LiteLLM Proxy"
  | "Self-Hosted"
  | "Custom";

export type ModelOption = {
  id: string;
  label: string;
  provider: ProviderId;
  tag: ModelTag;
  note: string;
  browserDirect: boolean;
  supportsJsonMode: boolean;
  recommendedConcurrency: number;
  recommendedCooldownSec: number;
};

export const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
export const CEREBRAS_BASE = "https://api.cerebras.ai/v1/chat/completions";
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
export const OLLAMA_DEFAULT_BASE = "http://localhost:11434/v1/chat/completions";
export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const LITELLM_DEFAULT_BASE = "http://localhost:4000/v1";

export const MODELS: ModelOption[] = [
  // =========================================================================
  // ⚡ 1. GROQ CLOUD (100% Permanent Free Tier · 14,400 Requests/Day · 500+ tok/s)
  // =========================================================================
  {
    id: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B Versatile (Groq)",
    provider: "groq",
    tag: "Recommended",
    note: "100% Free · 14,400 daily reqs, 30 RPM, 300+ tok/s. Multi-resume fast screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant (Groq)",
    provider: "groq",
    tag: "High Rate Limit",
    note: "100% Free · 600+ tok/s instant throughput. Rapid screening of 100+ resumes.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "mixtral-8x7b-32768",
    label: "Mixtral 8x7B (Groq)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Free · 400+ tok/s Mixture-of-Experts high-throughput processing.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "gemma2-9b-it",
    label: "Gemma 2 9B IT (Groq)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Free · Google Gemma 2 accelerated with extreme Groq LPU throughput.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },

  // =========================================================================
  // 🚀 2. CEREBRAS WAFER-SCALE (100% Permanent Free Tier · 1,800 tok/s)
  // =========================================================================
  {
    id: "llama3.1-8b",
    label: "Llama 3.1 8B (Cerebras)",
    provider: "cerebras",
    tag: "High Rate Limit",
    note: "100% Free · 1,800 tokens/sec (World's fastest). Instant multi-worker screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 1,
  },
  {
    id: "llama-3.3-70b",
    label: "Llama 3.3 70B (Cerebras)",
    provider: "cerebras",
    tag: "Recommended",
    note: "100% Free · 450 tokens/sec wafer-scale 70B recruiter reasoning with zero lag.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },

  // =========================================================================
  // 🌐 3. GOOGLE GEMINI (Mid Rate Limit · Strict 15 RPM · Safe 1-at-a-time)
  // =========================================================================
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    tag: "Recommended",
    note: "100% Free · 1,500 daily requests, strict 15 RPM limit (1 resume at a time with 4s safe delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 4,
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    provider: "gemini",
    tag: "High Speed",
    note: "100% Free · Next-gen flash architecture (1 resume at a time with 4s safe delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 4,
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    provider: "gemini",
    tag: "High Rate Limit",
    note: "100% Free · Stable 15 RPM free tier with low token latency (1 resume at a time).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 4,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    tag: "Deep Reasoning",
    note: "100% Free · Deepest hiring manager reasoning (1 resume at a time with 6s safe delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 6,
  },

  // =========================================================================
  // 🔀 4. OPENROUTER FREE TIER (:free Models · Safe 1-at-a-time)
  // =========================================================================
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (OpenRouter :free)",
    provider: "openrouter",
    tag: "Recommended",
    note: "100% Free · Meta's flagship 70B model via community endpoints (1 at a time, 4s delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 4,
  },
  {
    id: "deepseek/deepseek-r1:free",
    label: "DeepSeek R1 (OpenRouter :free)",
    provider: "openrouter",
    tag: "Deep Reasoning",
    note: "100% Free · Uncapped deep chain-of-thought reasoning (1 at a time, 5s delay).",
    browserDirect: true,
    supportsJsonMode: false,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 5,
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    label: "Qwen 2.5 Coder 32B (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Speed",
    note: "100% Free · Top-tier code & tech stack screening (1 at a time, 4s delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 4,
  },
  {
    id: "mistralai/mistral-small-24b-instruct:free",
    label: "Mistral Small 24B (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Speed",
    note: "100% Free · Efficient European LLM with high keyword accuracy (1 at a time, 4s delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 4,
  },

  // =========================================================================
  // 🟢 5. NVIDIA NIM (1,000 Free Credits)
  // =========================================================================
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B Instruct (NVIDIA)",
    provider: "nvidia",
    tag: "Recommended",
    note: "Free API credits · Recruiter-quality feedback & TensorRT acceleration (2 co-workers, 2s delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B Instruct (NVIDIA)",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Highest throughput & maximum RPM rate limit (3 co-workers, 1s delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "mistralai/mistral-small-24b-instruct",
    label: "Mistral Small 24B (NVIDIA)",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Fast, sharp technical critique & structured JSON (2 co-workers, 2s delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    label: "Qwen 2.5 Coder 32B (NVIDIA)",
    provider: "nvidia",
    tag: "High Speed",
    note: "Free API credits · Specialized for software engineering & architectures (2 co-workers, 2s delay).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },

  // =========================================================================
  // 💻 6. LOCAL OFFLINE OLLAMA (100% Free · Unlimited · Zero Rate Limit)
  // =========================================================================
  {
    id: "llama3.2",
    label: "Local Ollama — Llama 3.2 (3B/8B)",
    provider: "ollama",
    tag: "Self-Hosted",
    note: "100% Free & Private · Zero rate limits, zero API keys. Screens 1,000+ resumes completely offline.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "qwen2.5-coder",
    label: "Local Ollama — Qwen 2.5 Coder (7B/14B)",
    provider: "ollama",
    tag: "Self-Hosted",
    note: "100% Free & Private · Unrestricted local technical evaluation for software candidates.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "mistral",
    label: "Local Ollama — Mistral (7B)",
    provider: "ollama",
    tag: "Self-Hosted",
    note: "100% Free & Private · Highly reliable local JSON output on localhost:11434.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },

  // =========================================================================
  // 🔗 7. LiteLLM Proxy Gateway & Custom Endpoints
  // =========================================================================
  {
    id: "litellm-proxy",
    label: "LiteLLM Proxy (Custom Gateway)",
    provider: "litellm",
    tag: "Self-Hosted",
    note: "Connect to your LiteLLM Proxy (http://localhost:4000/v1) routing to any upstream LLM.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "custom",
    label: "Custom Endpoint / vLLM / Local Server",
    provider: "openai-compatible",
    tag: "Custom",
    note: "Connect to any custom OpenAI-compatible URL or local vLLM cluster.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },
];

export const DEFAULT_MODEL_ID = "llama-3.3-70b-versatile";

export function findModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!;
}

export function modelsByProvider(): Record<ProviderId, ModelOption[]> {
  return MODELS.reduce(
    (acc, m) => {
      (acc[m.provider] ||= []).push(m);
      return acc;
    },
    {} as Record<ProviderId, ModelOption[]>,
  );
}

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  groq: "⚡ Groq Cloud (100% Free · 14,400/Day · 500+ tok/s)",
  cerebras: "🚀 Cerebras Wafer-Scale (100% Free · 1,800 tok/s)",
  gemini: "🌐 Google Gemini (100% Free · 1,500/Day · 1M Context)",
  openrouter: "🔀 OpenRouter (:free Models · 100% Free)",
  ollama: "💻 Local Ollama (100% Free · Unlimited · 0 Rate Limit)",
  nvidia: "🟢 NVIDIA NIM (1,000 Free Credits)",
  litellm: "🔗 LiteLLM Proxy Gateway",
  "openai-compatible": "🛠️ Custom Endpoint / vLLM",
};

export const MODEL_COUNT = MODELS.length;
