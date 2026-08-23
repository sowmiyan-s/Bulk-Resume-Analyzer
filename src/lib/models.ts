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
  | "LiteLLM Proxy";

export type ModelOption = {
  id: string;
  label: string;
  provider: ProviderId;
  tag: ModelTag;
  /** Guidance shown in the model picker. */
  note: string;
  /** True when the raw endpoint is browser-callable without a proxy. */
  browserDirect: boolean;
  /** Models that reliably honour a JSON-schema / json_object response format. */
  supportsJsonMode: boolean;
  /** Optimal parallel workers for batch processing without rate limit errors. */
  recommendedConcurrency: number;
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
    note: "100% Permanent Free · 14,400 daily requests, 30 RPM, 300+ tok/s LPU speed. Zero trials.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant (Groq)",
    provider: "groq",
    tag: "High Rate Limit",
    note: "100% Permanent Free · 600+ tok/s. Instant batch screening for 100+ resumes in minutes.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
  },
  {
    id: "mixtral-8x7b-32768",
    label: "Mixtral 8x7B (Groq)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Permanent Free · 400+ tok/s high-throughput Mixture-of-Experts architecture.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "gemma2-9b-it",
    label: "Gemma 2 9B IT (Groq)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Permanent Free · Google Gemma 2 accelerated with extreme Groq LPU throughput.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },

  // =========================================================================
  // 🚀 2. CEREBRAS WAFER-SCALE (100% Permanent Free Tier · 1,800 tok/s)
  // =========================================================================
  {
    id: "llama3.1-8b",
    label: "Llama 3.1 8B (Cerebras)",
    provider: "cerebras",
    tag: "High Rate Limit",
    note: "100% Permanent Free · 1,800 tokens/sec (World's fastest). Non-stop instant batch evaluation.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
  },
  {
    id: "llama-3.3-70b",
    label: "Llama 3.3 70B (Cerebras)",
    provider: "cerebras",
    tag: "Recommended",
    note: "100% Permanent Free · 450 tokens/sec wafer-scale 70B recruiter reasoning with zero lag.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },

  // =========================================================================
  // 🌐 3. GOOGLE GEMINI (100% Permanent Free Tier · 1,500 Assessments/Day)
  // =========================================================================
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    tag: "Recommended",
    note: "100% Permanent Free · 1,500 daily requests, 15 RPM, 1M context. Flawless structured JSON.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    provider: "gemini",
    tag: "High Speed",
    note: "100% Permanent Free · Next-gen flash architecture for massive non-stop resume batches.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    provider: "gemini",
    tag: "High Rate Limit",
    note: "100% Permanent Free · Stable 15 RPM free tier with low token latency.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    tag: "Deep Reasoning",
    note: "100% Permanent Free · Deepest hiring manager reasoning and exhaustive candidate critique.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },

  // =========================================================================
  // 🔀 4. OPENROUTER FREE TIER (:free Permanent Community Models)
  // =========================================================================
  {
    id: "deepseek/deepseek-r1:free",
    label: "DeepSeek R1 (OpenRouter :free)",
    provider: "openrouter",
    tag: "Deep Reasoning",
    note: "100% Free · Uncapped deep chain-of-thought reasoning without paying API fees.",
    browserDirect: true,
    supportsJsonMode: false,
    recommendedConcurrency: 2,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (OpenRouter :free)",
    provider: "openrouter",
    tag: "Recommended",
    note: "100% Free · Meta's flagship 70B model served through open community endpoints.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    label: "Qwen 2.5 Coder 32B (OpenRouter :free)",
    provider: "openrouter",
    tag: "Code & Tech",
    note: "100% Free · Expert software development and technical stack parsing.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "mistralai/mistral-small-24b-instruct:free",
    label: "Mistral Small 24B (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Rate Limit",
    note: "100% Free · Fast, structured, low-latency resume assessment.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },

  // =========================================================================
  // 💻 5. LOCAL OFFLINE OLLAMA (100% Free · Unlimited · Zero Rate Limit)
  // =========================================================================
  {
    id: "llama3.2",
    label: "Local Ollama — Llama 3.2 (3B/8B)",
    provider: "ollama",
    tag: "Unlimited Offline",
    note: "100% Free & Private · Zero rate limits, zero API keys. Screens 1,000+ resumes completely offline.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "qwen2.5-coder",
    label: "Local Ollama — Qwen 2.5 Coder (7B/14B)",
    provider: "ollama",
    tag: "Unlimited Offline",
    note: "100% Free & Private · Unrestricted local technical evaluation for software candidates.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "mistral",
    label: "Local Ollama — Mistral (7B)",
    provider: "ollama",
    tag: "Unlimited Offline",
    note: "100% Free & Private · Highly reliable local JSON output on localhost:11434.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },

  // =========================================================================
  // 🟢 6. NVIDIA NIM (1,000 Free Credits)
  // =========================================================================
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B Instruct (NVIDIA)",
    provider: "nvidia",
    tag: "Recommended",
    note: "Free API credits · Recruiter-quality feedback & TensorRT acceleration.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B Instruct (NVIDIA)",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Highest throughput & maximum RPM rate limit.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "mistralai/mistral-small-24b-instruct",
    label: "Mistral Small 24B (NVIDIA)",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Fast, sharp technical critique & structured JSON.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    label: "Qwen 2.5 Coder 32B (NVIDIA)",
    provider: "nvidia",
    tag: "Code & Tech",
    note: "Free API credits · Specialized for software engineering & architectures.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },

  // =========================================================================
  // 🔗 7. LiteLLM Proxy Gateway & Custom Endpoints
  // =========================================================================
  {
    id: "litellm-proxy",
    label: "LiteLLM Proxy (Custom Gateway)",
    provider: "litellm",
    tag: "LiteLLM Proxy",
    note: "Connect to your LiteLLM Proxy (http://localhost:4000/v1) routing to any upstream LLM.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "custom",
    label: "Custom Endpoint / vLLM / Local Server",
    provider: "openai-compatible",
    tag: "High Rate Limit",
    note: "Connect to any custom OpenAI-compatible URL or local vLLM cluster.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
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
