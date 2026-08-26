/**
 * Multi-model registry for Groq, Cerebras, Google Gemini, OpenRouter (:free), Local Ollama,
 * NVIDIA NIM, LiteLLM, and OpenAI-compatible endpoints.
 * Curated specifically for 100% PERMANENT FREE endpoints with massive rate limits (100+ non-stop screening).
 */

export type ProviderId =
  | "qwen"
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
  baseUrl?: string;
};

export const QWEN_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
export const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
export const CEREBRAS_BASE = "https://api.cerebras.ai/v1/chat/completions";
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
export const OLLAMA_DEFAULT_BASE = "http://localhost:11434/v1/chat/completions";
export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const LITELLM_DEFAULT_BASE = "http://localhost:4000/v1";

export const MODELS: ModelOption[] = [
  // =========================================================================
  // 🌟 1. QWEN CLOUD (home.qwencloud.com/benefits · 1M-2M Free Trial Tokens)
  // =========================================================================
  {
    id: "qwen-plus",
    label: "Qwen Plus (Qwen Cloud Benefits)",
    provider: "qwen",
    tag: "Recommended",
    note: "home.qwencloud.com/benefits · 2,000,000 free tokens benefit for balanced recruiter reasoning & ATS score calibration.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "qwen-turbo",
    label: "Qwen Turbo (Qwen Cloud Benefits)",
    provider: "qwen",
    tag: "High Speed",
    note: "home.qwencloud.com/benefits · 2,000,000 free tokens benefit for ultra-fast mass screening of 1,000+ student resumes.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 1,
  },
  {
    id: "qwen-max",
    label: "Qwen Max (Qwen Cloud Benefits)",
    provider: "qwen",
    tag: "Deep Reasoning",
    note: "home.qwencloud.com/benefits · 1,000,000 free tokens benefit for 100B+ deep architectural and technical resume critique.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "qwen2.5-coder-32b-instruct",
    label: "Qwen 2.5 Coder 32B (Qwen Cloud Benefits)",
    provider: "qwen",
    tag: "Code & Tech",
    note: "home.qwencloud.com/benefits · 1,000,000 free tokens benefit for technical stack & coding framework evaluation.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "qwen2.5-coder-7b-instruct",
    label: "Qwen 2.5 Coder 7B (Qwen Cloud Benefits)",
    provider: "qwen",
    tag: "High Speed",
    note: "home.qwencloud.com/benefits · 1,000,000 free tokens benefit for campus placement entry-level technical stack screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  // =========================================================================
  // ⚡ 2. GROQ CLOUD (100% Verified Live · Extreme LPU Speed)
  // =========================================================================
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq Cloud LPU)",
    provider: "groq",
    tag: "Recommended",
    note: "100% Free & Verified · 120B parameters at extreme Groq LPU throughput (590ms) for recruiter-level scoring.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B (Groq Cloud LPU)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Free & Verified · 600+ tok/s ultra-fast screening for batch candidate filtering.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "groq/compound",
    label: "Groq Compound (Groq Cloud LPU)",
    provider: "groq",
    tag: "High Rate Limit",
    note: "100% Free & Verified · Multi-expert reasoning pipeline for zero-latency resume processing.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "groq/compound-mini",
    label: "Groq Compound Mini (Groq Cloud LPU)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Free & Verified · Lightweight compound model for lightning candidate screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },

  // =========================================================================
  // 🚀 3. CEREBRAS WAFER-SCALE (1,800 tok/s Wafer-Scale Engine)
  // =========================================================================
  {
    id: "gpt-oss-120b",
    label: "GPT-OSS 120B (Cerebras Wafer-Scale)",
    provider: "cerebras",
    tag: "Recommended",
    note: "Wafer-scale speed (1,800 tok/s) 120B reasoning model with zero latency.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "gemma-4-31b",
    label: "Gemma 4 31B (Cerebras Wafer-Scale)",
    provider: "cerebras",
    tag: "High Speed",
    note: "Google Gemma 4 on wafer-scale engine for instantaneous candidate scoring.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },

  // =========================================================================
  // 🌐 4. GOOGLE GEMINI (100% Free Tier · Strict 15 RPM · Safe 1-at-a-time)
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
  // 🔀 5. OPENROUTER FREE TIER (100% Verified Live Free Models)
  // =========================================================================
  {
    id: "openrouter/free",
    label: "OpenRouter Auto-Free (Top Active Free LLM)",
    provider: "openrouter",
    tag: "Recommended",
    note: "100% Free & Verified · Auto-routes to the highest-availability active free model on OpenRouter.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 3,
  },
  {
    id: "google/gemma-4-31b-it:free",
    label: "Google Gemma 4 31B (OpenRouter :free)",
    provider: "openrouter",
    tag: "Recommended",
    note: "100% Free & Verified · Google's 31B instruction model for structured resume evaluation.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 3,
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    label: "Google Gemma 4 26B (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Speed",
    note: "100% Free & Verified · Fast Google Gemma 4 architecture for rapid batch processing.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 3,
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    label: "NVIDIA Nemotron 3.5 Lightning (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Speed",
    note: "100% Free & Verified · High-speed Nemotron model with 400ms low-latency screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 3,
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "NVIDIA Nemotron 120B (OpenRouter :free)",
    provider: "openrouter",
    tag: "Deep Reasoning",
    note: "100% Free & Verified · 120B flagship reasoning model for detailed candidate review (200ms latency).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 3,
  },
  {
    id: "minimax/minimax-m3:free",
    label: "MiniMax M3 (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Rate Limit",
    note: "100% Free & Verified · Free model with rich structured JSON outputs.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 3,
  },
  {
    id: "cohere/north-mini-code:free",
    label: "Cohere North Mini Code (OpenRouter :free)",
    provider: "openrouter",
    tag: "Code & Tech",
    note: "100% Free & Verified · Specialized for coding competencies and technical stack screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 3,
  },

  // =========================================================================
  // 🟢 6. NVIDIA NIM (100% Verified Live TensorRT Acceleration)
  // =========================================================================
  {
    id: "meta/llama-3.2-11b-vision-instruct",
    label: "Llama 3.2 11B Vision (NVIDIA NIM)",
    provider: "nvidia",
    tag: "Recommended",
    note: "100% Verified Live · Fast multimodal & structured ATS analysis with zero rate errors.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B (NVIDIA NIM)",
    provider: "nvidia",
    tag: "Deep Reasoning",
    note: "100% Verified · Flagship 120B model accelerated by NVIDIA TensorRT for recruiter-level scoring.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B (NVIDIA NIM)",
    provider: "nvidia",
    tag: "High Speed",
    note: "100% Verified · High throughput 20B TensorRT model for fast candidate filtering.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },

  // =========================================================================
  // 💻 7. LOCAL OFFLINE OLLAMA (100% Free · Unlimited · Zero Rate Limit)
  // =========================================================================
  {
    id: "qwen2.5-coder",
    label: "Local Ollama — Qwen 2.5 Coder (7B/14B/32B)",
    provider: "ollama",
    tag: "Code & Tech",
    note: "100% Free & Private · Unrestricted local technical evaluation for software candidates.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "qwen2.5",
    label: "Local Ollama — Qwen 2.5 (7B/14B/72B)",
    provider: "ollama",
    tag: "Self-Hosted",
    note: "100% Free & Private · Full-capability offline Qwen reasoning model on localhost:11434.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
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
  // 🔗 8. LiteLLM Proxy Gateway & Custom Endpoints
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

export const DEFAULT_MODEL_ID = "qwen-plus";

export const FALLBACK_PROVIDER_ORDER: ProviderId[] = [
  "qwen",
  "cerebras",
  "groq",
  "gemini",
  "openrouter",
  "nvidia",
];

export function getDefaultModelForProvider(provider: ProviderId): ModelOption {
  const byProvider = modelsByProvider();
  const list = byProvider[provider] || [];
  if (!list.length) return findModel(DEFAULT_MODEL_ID);
  // Pick recommended or first
  const rec = list.find((m) => m.tag === "Recommended") || list[0]!;
  return rec;
}

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
  qwen: "🌟 Qwen Cloud Benefits (home.qwencloud.com/benefits · 1M-2M Free Tokens)",
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

