/**
 * Multi-model registry for Groq, Cerebras, Google Gemini, OpenRouter (:free), Local Ollama,
 * NVIDIA NIM, LiteLLM, and OpenAI-compatible endpoints.
 * Curated specifically for 100% PERMANENT FREE endpoints with massive rate limits (100+ non-stop screening).
 */

export type ProviderId =
  | "lovable"
  | "openai"
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

export const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";
export const QWEN_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
export const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
export const CEREBRAS_BASE = "https://api.cerebras.ai/v1/chat/completions";
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
export const OLLAMA_DEFAULT_BASE = "http://localhost:11434/v1/chat/completions";
export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const LITELLM_DEFAULT_BASE = "http://localhost:4000/v1";

export const LOVABLE_GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const MODELS: ModelOption[] = [
  // =========================================================================
  // 🧠 0. OPENAI GPT (Official GPT-4o, GPT-4o-mini & GPT-3.5 Models)
  // =========================================================================
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini (Official OpenAI)",
    provider: "openai",
    tag: "High Speed",
    note: "Official OpenAI · Ultra-fast, highly accurate candidate evaluator with native JSON structured output.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o (Official OpenAI Flagship)",
    provider: "openai",
    tag: "Recommended",
    note: "Official OpenAI · SOTA reasoning & deep technical skillset analysis.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "gpt-3.5-turbo",
    label: "GPT-3.5 Turbo (Official OpenAI)",
    provider: "openai",
    tag: "High Speed",
    note: "Official OpenAI · Fast, cost-effective baseline screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  // =========================================================================
  // ⚡ 1. GROQ CLOUD (Ultra-Fast LPUs · 300 to 1,000+ tok/s · Non-Thinking)
  // =========================================================================
  {
    id: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B Versatile (Groq Cloud LPU)",
    provider: "groq",
    tag: "Recommended",
    note: "100% Free · 330 tok/s · Flagship 70B accuracy at sub-second LPU speed without thinking delays.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant (Groq Cloud LPU)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Free · 850+ tok/s · Ultra-fast ~300ms direct screening for high-volume 50+ resume batches.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "mixtral-8x7b-32768",
    label: "Mixtral 8x7B (Groq Cloud LPU)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Free · 550+ tok/s · Fast mixture-of-experts model with 32k context and zero latency.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "gemma2-9b-it",
    label: "Gemma 2 9B (Groq Cloud LPU)",
    provider: "groq",
    tag: "High Speed",
    note: "100% Free · 480 tok/s · Google Gemma 2 accelerated by Groq LPUs for rapid technical checks.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "qwen-2.5-coder-32b",
    label: "Qwen 2.5 Coder 32B (Groq Cloud LPU)",
    provider: "groq",
    tag: "Code & Tech",
    note: "100% Free · Specialized 32B coding evaluator accelerated on Groq LPU chips.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    label: "DeepSeek R1 Distill 70B (Groq Cloud LPU)",
    provider: "groq",
    tag: "Deep Reasoning",
    note: "100% Free · 300+ tok/s · Open source DeepSeek R1 reasoning architecture accelerated on Groq LPUs.",
    browserDirect: true,
    supportsJsonMode: false,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },

  // =========================================================================
  // 🚀 2. CEREBRAS WAFER-SCALE (World's Fastest Inference · 1,800+ tok/s)
  // =========================================================================
  {
    id: "llama3.3-70b",
    label: "Llama 3.3 70B (Cerebras Wafer-Scale)",
    provider: "cerebras",
    tag: "Recommended",
    note: "100% Free · 1,800 tok/s · World's fastest 70B engine (~450ms total response time, non-thinking).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "llama3.1-8b",
    label: "Llama 3.1 8B (Cerebras Wafer-Scale)",
    provider: "cerebras",
    tag: "High Speed",
    note: "100% Free · 2,100+ tok/s · Instantaneous ~200ms candidate screening on Cerebras hardware.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },

  // =========================================================================
  // 🌟 3. QWEN CLOUD / DASHSCOPE (home.qwencloud.com/benefits · 1M-2M Tokens)
  // =========================================================================
  {
    id: "qwen-plus",
    label: "Qwen Plus (Qwen Cloud Benefits)",
    provider: "qwen",
    tag: "Recommended",
    note: "home.qwencloud.com/benefits · 2,000,000 free tokens · Balanced recruiter reasoning & fast generation.",
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
    note: "home.qwencloud.com/benefits · 2,000,000 free tokens · Ultra-fast non-thinking direct generation.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "qwen2.5-coder-32b-instruct",
    label: "Qwen 2.5 Coder 32B (Qwen Cloud Benefits)",
    provider: "qwen",
    tag: "Code & Tech",
    note: "home.qwencloud.com/benefits · 1,000,000 free tokens · Fast technical stack & code architecture scoring.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "qwen2.5-coder-7b-instruct",
    label: "Qwen 2.5 Coder 7B (Qwen Cloud Benefits)",
    provider: "qwen",
    tag: "High Speed",
    note: "home.qwencloud.com/benefits · 1,000,000 free tokens · Lightweight fast entry-level tech screening.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },

  // =========================================================================
  // 🌐 4. GOOGLE GEMINI (Fast Flash Architecture · 1,500 Requests/Day Free)
  // =========================================================================
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    provider: "gemini",
    tag: "Recommended",
    note: "100% Free · Ultra-fast next-gen flash architecture with sub-second TTFT (non-thinking).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "gemini-2.0-flash-lite",
    label: "Gemini 2.0 Flash Lite",
    provider: "gemini",
    tag: "High Speed",
    note: "100% Free · Ultra-low latency lightweight model for rapid batch candidate processing.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    provider: "gemini",
    tag: "High Rate Limit",
    note: "100% Free · Reliable 15 RPM free tier with low token latency (1-2 concurrent).",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 1,
    recommendedCooldownSec: 4,
  },

  // =========================================================================
  // 🔀 5. OPENROUTER FREE TIER (100% Verified Live :free Models)
  // =========================================================================
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Meta Llama 3.3 70B (OpenRouter :free)",
    provider: "openrouter",
    tag: "Recommended",
    note: "100% Free · Flagship Meta 70B model with high accuracy and direct fast generation.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "meta-llama/llama-3.1-8b-instruct:free",
    label: "Meta Llama 3.1 8B (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Speed",
    note: "100% Free · High throughput 8B model with ultra-fast turnaround time.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek V3 (OpenRouter)",
    provider: "openrouter",
    tag: "Recommended",
    note: "OpenRouter · SOTA open weights 671B Mixture-of-Experts with ultra-fast inference.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "deepseek/deepseek-r1:free",
    label: "DeepSeek R1 (OpenRouter :free)",
    provider: "openrouter",
    tag: "Deep Reasoning",
    note: "100% Free · Deep reasoning open weights model with verified chain of thought.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "openai/gpt-4o-mini",
    label: "OpenAI GPT-4o Mini (OpenRouter)",
    provider: "openrouter",
    tag: "High Speed",
    note: "OpenRouter · High speed, cost-effective structured ATS scoring via OpenRouter.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "openai/gpt-4o",
    label: "OpenAI GPT-4o (OpenRouter)",
    provider: "openrouter",
    tag: "Deep Reasoning",
    note: "OpenRouter · Flagship GPT-4o model with comprehensive recruiter auditing.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },
  {
    id: "qwen/qwen-2.5-72b-instruct:free",
    label: "Qwen 2.5 72B (OpenRouter :free)",
    provider: "openrouter",
    tag: "Recommended",
    note: "100% Free · Large-scale open weights 72B flagship model with elite coding proficiency.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 2,
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    label: "Qwen 2.5 Coder 32B (OpenRouter :free)",
    provider: "openrouter",
    tag: "Code & Tech",
    note: "100% Free · Specialized coding model for candidate tech stack evaluation.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },
  {
    id: "mistralai/mistral-7b-instruct:free",
    label: "Mistral 7B Instruct (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Speed",
    note: "100% Free · Reliable fast European LLM for crisp structured resume assessments.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    label: "Google Gemini 2.0 Flash Exp (OpenRouter :free)",
    provider: "openrouter",
    tag: "High Speed",
    note: "100% Free · Fast Google Flash architecture accessible via OpenRouter free pool.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },

  // =========================================================================
  // 🟢 6. NVIDIA NIM (TensorRT Accelerated Inference)
  // =========================================================================
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Meta Llama 3.3 70B (NVIDIA NIM)",
    provider: "nvidia",
    tag: "Recommended",
    note: "1,000 Free Credits · TensorRT-LLM hardware accelerated 70B model with high accuracy.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 1,
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    label: "Meta Llama 3.1 8B (NVIDIA NIM)",
    provider: "nvidia",
    tag: "High Speed",
    note: "1,000 Free Credits · Ultra-fast TensorRT 8B model with sub-second response time.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },
  {
    id: "mistralai/mistral-large-2-instruct",
    label: "Mistral Large 2 (NVIDIA NIM)",
    provider: "nvidia",
    tag: "Deep Reasoning",
    note: "1,000 Free Credits · Large-scale instruction model optimized on NVIDIA GPUs.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 2,
    recommendedCooldownSec: 1,
  },

  // =========================================================================
  // 🏆 7. LOVABLE AI GATEWAY (Hosted Key · Zero Rate Wall)
  // =========================================================================
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (Lovable AI Gateway)",
    provider: "lovable",
    tag: "Recommended",
    note: "Hosted gateway key · High-speed non-thinking direct generation for 50+ resume batches.",
    browserDirect: false,
    supportsJsonMode: true,
    recommendedConcurrency: 3,
    recommendedCooldownSec: 0,
  },
  {
    id: "google/gemini-2.0-flash-lite",
    label: "Gemini 2.0 Flash Lite (Lovable AI Gateway)",
    provider: "lovable",
    tag: "High Speed",
    note: "Hosted gateway key · Ultra-low latency lightweight model for lightning candidate screening.",
    browserDirect: false,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },

  // =========================================================================
  // 💻 8. LOCAL OFFLINE OLLAMA (100% Free · Unlimited · Zero Rate Limits)
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
    id: "llama3.2",
    label: "Local Ollama — Llama 3.2 (3B/8B)",
    provider: "ollama",
    tag: "High Speed",
    note: "100% Free & Private · Ultra-fast local execution with zero API keys and zero rate limits.",
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
    note: "100% Free & Private · Fast local structured JSON output on localhost:11434.",
    browserDirect: true,
    supportsJsonMode: true,
    recommendedConcurrency: 4,
    recommendedCooldownSec: 0,
  },

  // =========================================================================
  // 🔗 9. LiteLLM Proxy Gateway & Custom Endpoints
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

export const FALLBACK_PROVIDER_ORDER: ProviderId[] = [
  "lovable",
  "openai",
  "nvidia",
  "groq",
  "openrouter",
  "qwen",
  "cerebras",
  "gemini",
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
  lovable: "🏆 Lovable AI Gateway (hosted key · no free-tier rate wall)",
  openai: "🧠 OpenAI Official (GPT-4o, GPT-4o Mini, GPT-3.5)",
  qwen: "🌟 Qwen Cloud Benefits (home.qwencloud.com/benefits · 1M-2M Free Tokens)",
  groq: "⚡ Groq Cloud (100% Free · 14,400/Day · 500+ tok/s)",
  cerebras: "🚀 Cerebras Wafer-Scale (100% Free · 1,800 tok/s)",
  gemini: "🌐 Google Gemini (100% Free · 1,500/Day · 1M Context)",
  openrouter: "🔀 OpenRouter (:free & Flagship OSS Models)",
  ollama: "💻 Local Ollama (100% Free · Unlimited · 0 Rate Limit)",
  nvidia: "🟢 NVIDIA NIM (1,000 Free Credits)",
  litellm: "🔗 LiteLLM Proxy Gateway",
  "openai-compatible": "🛠️ Custom Endpoint / vLLM",
};

export const MODEL_COUNT = MODELS.length;

