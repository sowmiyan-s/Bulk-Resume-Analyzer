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
    note: "Free API credits · Best recruiter-quality feedback & high reliability.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash (0731)",
    provider: "nvidia",
    tag: "High Speed",
    note: "Free API credits · Ultra-fast direct inference with zero thinking latency.",
    browserDirect: true,
    supportsJsonMode: false,
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B Instruct",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Highest throughput & rate limit. Instant batch screening.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "mistralai/mistral-small-24b-instruct",
    label: "Mistral Small 24B",
    provider: "nvidia",
    tag: "High Rate Limit",
    note: "Free API credits · Fast, low-latency, reliable structured JSON scoring.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    label: "Qwen 2.5 Coder 32B",
    provider: "nvidia",
    tag: "Code & Tech",
    note: "Free API credits · Specialized for software engineering & technical stacks.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    label: "Nemotron 70B Instruct",
    provider: "nvidia",
    tag: "Recommended",
    note: "Free API credits · NVIDIA-optimized model for high precision audit.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "deepseek-ai/deepseek-r1-distill-qwen-32b",
    label: "DeepSeek R1 Distill 32B",
    provider: "nvidia",
    tag: "Deep Reasoning",
    note: "Free API credits · In-depth chain-of-thought analysis for top candidates.",
    browserDirect: true,
    supportsJsonMode: false,
  },

  // ---------- LiteLLM Proxy Gateway (100+ Models) ----------
  {
    id: "litellm-proxy",
    label: "LiteLLM Proxy (Custom Model)",
    provider: "litellm",
    tag: "LiteLLM Proxy",
    note: "Connect to your LiteLLM Proxy (http://localhost:4000/v1) routing to any upstream LLM.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "gpt-4o-mini",
    label: "LiteLLM — gpt-4o-mini",
    provider: "litellm",
    tag: "High Speed",
    note: "Route OpenAI gpt-4o-mini through your LiteLLM Proxy.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    label: "LiteLLM — Claude 3.5 Sonnet",
    provider: "litellm",
    tag: "Recommended",
    note: "Route Anthropic Claude 3.5 Sonnet through your LiteLLM Proxy.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "ollama/llama3.2",
    label: "LiteLLM — Ollama Local Llama 3.2",
    provider: "litellm",
    tag: "High Rate Limit",
    note: "100% free and private offline screening via local Ollama routed by LiteLLM.",
    browserDirect: true,
    supportsJsonMode: true,
  },

  // ---------- Google Gemini (Generous Free Tier) ----------
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    tag: "Recommended",
    note: "Generous 15 RPM free tier on Google AI Studio. Direct browser execution.",
    browserDirect: true,
    supportsJsonMode: true,
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    provider: "gemini",
    tag: "High Speed",
    note: "Fast free tier model with high throughput for bulk resume batches.",
    browserDirect: true,
    supportsJsonMode: true,
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
