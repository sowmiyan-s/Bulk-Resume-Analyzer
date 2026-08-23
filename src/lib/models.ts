/**
 * Multi-model registry for NVIDIA NIM, Google Gemini, LiteLLM Proxy, and OpenAI-compatible endpoints.
 * Curated specifically for free tier endpoints, high rate-limit models, and LiteLLM gateways.
 */

export type ProviderId = "nvidia" | "gemini" | "litellm" | "openai-compatible";

export type ModelTag =
  | "High Speed"
  | "Recommended"
  | "High Rate Limit"
  | "Deep Reasoning"
  | "Code & Tech"
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

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const LITELLM_DEFAULT_BASE = "http://localhost:4000/v1";

export const MODELS: ModelOption[] = [
  // ---------- NVIDIA NIM (Free Tier & High Rate Limits) ----------
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B Instruct",
    provider: "nvidia",
    tag: "Recommended",
    note: "Free API credits · Best recruiter-quality feedback, honest evaluation & high reliability.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    label: "Llama 3.1 70B Instruct",
    provider: "nvidia",
    tag: "Deep Reasoning",
    note: "Free API credits · Heavyweight 70B model with deep candidate evaluation.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B Instruct",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Highest throughput & maximum RPM rate limit. Rapid batch screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "mistralai/mistral-small-24b-instruct",
    label: "Mistral Small 24B",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Fast, high rate limits, sharp technical critique & structured JSON.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "mistralai/mixtral-8x7b-instruct-v0.1",
    label: "Mixtral 8x7B Instruct",
    provider: "nvidia",
    tag: "High Speed",
    note: "Free API credits · High-speed Mixture-of-Experts model for fast batch processing.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "mistralai/mixtral-8x22b-instruct-v0.1",
    label: "Mixtral 8x22B Instruct",
    provider: "nvidia",
    tag: "Deep Reasoning",
    note: "Free API credits · Large-scale MoE model for intricate skill analysis.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    label: "Qwen 2.5 Coder 32B",
    provider: "nvidia",
    tag: "Code & Tech",
    note: "Free API credits · Specialized for software engineering, architectures & technical stacks.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "qwen/qwen2.5-72b-instruct",
    label: "Qwen 2.5 72B Instruct",
    provider: "nvidia",
    tag: "Deep Reasoning",
    note: "Free API credits · High-intelligence 72B model for executive and senior shortlisting.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },
  {
    id: "deepseek-ai/deepseek-r1-distill-qwen-32b",
    label: "DeepSeek R1 Distill 32B",
    provider: "nvidia",
    tag: "Deep Reasoning",
    note: "Free API credits · In-depth chain-of-thought reasoning for top candidate assessment.",
    browserDirect: true,
    supportsJsonMode: false,
    recommendedConcurrency: 1,
  },
  {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash",
    provider: "nvidia",
    tag: "High Speed",
    note: "Free API credits · Ultra-fast direct inference with zero thinking latency.",
    browserDirect: true,
    supportsJsonMode: false,
    recommendedConcurrency: 3,
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    label: "Nemotron 70B Instruct",
    provider: "nvidia",
    tag: "Recommended",
    note: "Free API credits · NVIDIA-optimized 70B model with high precision instruction following.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },
  {
    id: "google/gemma-2-27b-it",
    label: "Gemma 2 27B IT",
    provider: "nvidia",
    tag: "High Speed",
    note: "Free API credits · Google Gemma architecture hosted with TensorRT speed on NVIDIA NIM.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "google/gemma-2-9b-it",
    label: "Gemma 2 9B IT",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Lightweight, ultra-fast model with generous rate limits.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "microsoft/phi-3.5-mini-instruct",
    label: "Phi-3.5 Mini Instruct (3.8B)",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Highly efficient small language model with instant inference.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "microsoft/phi-3.5-moe-instruct",
    label: "Phi-3.5 MoE Instruct",
    provider: "nvidia",
    tag: "High Speed",
    note: "Free API credits · Microsoft Mixture-of-Experts model for balanced throughput.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },

  // ---------- Google Gemini (Generous Free Tier) ----------
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    tag: "Recommended",
    note: "Google AI Studio · Ultra-fast, highly accurate reasoning and broad skill parsing.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    tag: "Deep Reasoning",
    note: "Google AI Studio · Deepest reasoning and exhaustive resume critique.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    provider: "gemini",
    tag: "High Speed",
    note: "Google AI Studio · High throughput flash model for large resume batches.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    provider: "gemini",
    tag: "High Rate Limit",
    note: "Google AI Studio · Stable 15 RPM free tier with low token latency.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    provider: "gemini",
    tag: "Deep Reasoning",
    note: "Google AI Studio · 1M+ token context window for comprehensive audits.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
  },

  // ---------- LiteLLM Proxy Gateway (100+ Models) ----------
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
    id: "gpt-4o-mini",
    label: "LiteLLM — GPT-4o Mini",
    provider: "litellm",
    tag: "High Speed",
    note: "Route OpenAI gpt-4o-mini through your LiteLLM Proxy.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "gpt-4o",
    label: "LiteLLM — GPT-4o",
    provider: "litellm",
    tag: "Deep Reasoning",
    note: "Route OpenAI flagship GPT-4o through your LiteLLM Proxy.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    label: "LiteLLM — Claude 3.5 Sonnet",
    provider: "litellm",
    tag: "Recommended",
    note: "Route Anthropic Claude 3.5 Sonnet through your LiteLLM Proxy.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "claude-3-5-haiku-20241022",
    label: "LiteLLM — Claude 3.5 Haiku",
    provider: "litellm",
    tag: "High Speed",
    note: "Route Anthropic Claude 3.5 Haiku for lightning-speed screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "ollama/llama3.2",
    label: "LiteLLM — Ollama Local Llama 3.2",
    provider: "litellm",
    tag: "High Rate Limit",
    note: "100% free and private offline screening via local Ollama routed by LiteLLM.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },

  // ---------- Free Local / Custom Compatible Endpoints ----------
  {
    id: "custom",
    label: "Custom Endpoint (Groq Free / Local Ollama)",
    provider: "openai-compatible",
    tag: "High Rate Limit",
    note: "Connect directly to Groq (30 RPM free), Ollama (100% free offline), or vLLM.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
  },
  {
    id: "groq/llama-3.3-70b-versatile",
    label: "Groq — Llama 3.3 70B Versatile",
    provider: "openai-compatible",
    tag: "High Speed",
    note: "Ultra-fast LPUs on Groq API (https://api.groq.com/openai/v1) with 300+ tok/s.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
  },
  {
    id: "groq/llama-3.1-8b-instant",
    label: "Groq — Llama 3.1 8B Instant",
    provider: "openai-compatible",
    tag: "High Rate Limit",
    note: "Instant 500+ tok/s screening with high rate limits on Groq.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
  },
];

export const DEFAULT_MODEL_ID = "meta/llama-3.3-70b-instruct";

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
  nvidia: "NVIDIA NIM (Free 1,000 Credits)",
  gemini: "Google Gemini (Free Tier)",
  litellm: "LiteLLM Proxy (Multi-Provider)",
  "openai-compatible": "Custom / Groq Free / Local",
};

export const MODEL_COUNT = MODELS.length;
