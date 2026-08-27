/**
 * High-level role taxonomy + Generative-AI / Domestic-AI tool intelligence.
 *
 * This module powers two things the app previously lacked:
 *   1. A high-level ROLE ARC classifier so a resume is bucketed into a
 *      career spine (e.g. "AI / ML Engineer", "Data / Analytics", "GenAI
 *      Builder") instead of a single flat job title.
 *   2. A GENAI / DOMESTIC-AI TOOL TAXONOMY so any JD or resume — whether it
 *      mentions OpenAI, a domestic model (Qwen, DeepSeek, GLM, ERNIE, Grok,
 *      Kimi), or on-prem GPU stacks — is mapped to the real toolchain the
 *      candidate will actually need.
 *
 * It is pure (no model, no network) so it runs identically in the browser and
 * on the server, and is token-cheap enough to embed directly in the LLM prompt.
 */

/* --------------------------- high-level role arcs --------------------------- */

export type RoleArc =
  | "AI / ML Engineer"
  | "Generative AI / LLM Builder"
  | "Data / Analytics Engineer"
  | "Backend / Platform Engineer"
  | "Frontend / Product Engineer"
  | "DevOps / MLOps / SRE"
  | "Security / Cybersecurity"
  | "Cloud / Infrastructure"
  | "Mobile Engineer"
  | "QA / SDET"
  | "Design / UX"
  | "Product / Strategy"
  | "Student / Entry-Level (Undecided)";

const ROLE_ARC_RULES: Array<{ arc: RoleArc; signals: string[] }> = [
  {
    arc: "Generative AI / LLM Builder",
    signals: [
      "llm",
      "large language model",
      "gpt",
      "rag",
      "retrieval augmented",
      "langchain",
      "langgraph",
      "vector database",
      "pinecone",
      "weaviate",
      "chromadb",
      "llamaindex",
      "fine-tun",
      "prompt engineering",
      "agent",
      "multi-agent",
      "semantic kernel",
      "diffusion",
      "stable diffusion",
      "text-to-image",
      "genai",
      "generative ai",
      "transformer",
      "bert",
      "hugging face",
      "llama",
      "mistral",
      "qwen",
      "deepseek",
    ],
  },
  {
    arc: "AI / ML Engineer",
    signals: [
      "machine learning",
      "deep learning",
      "neural network",
      "pytorch",
      "tensorflow",
      "keras",
      "scikit-learn",
      "xgboost",
      "computer vision",
      "nlp",
      "reinforcement learning",
      "mlops",
      "model training",
      "inference",
      "onnx",
      "opencv",
      "speech",
      "recommendation",
    ],
  },
  {
    arc: "Data / Analytics Engineer",
    signals: [
      "data engineering",
      "etl",
      "spark",
      "hadoop",
      "kafka",
      "airflow",
      "dbt",
      "snowflake",
      "bigquery",
      "data warehouse",
      "data pipeline",
      "sql",
      "redshift",
      "databricks",
      "power bi",
      "tableau",
      "looker",
      "analytics",
      "statistics",
      "pandas",
      "numpy",
    ],
  },
  {
    arc: "DevOps / MLOps / SRE",
    signals: [
      "devops",
      "mlops",
      "sre",
      "kubernetes",
      "docker",
      "terraform",
      "ansible",
      "ci/cd",
      "jenkins",
      "github actions",
      "gitlab ci",
      "prometheus",
      "grafana",
      "observability",
      "site reliability",
      "helm",
      "argo",
      "istio",
    ],
  },
  {
    arc: "Cloud / Infrastructure",
    signals: [
      "aws",
      "azure",
      "gcp",
      "google cloud",
      "cloud architecture",
      "serverless",
      "lambda",
      "ec2",
      "s3",
      "cloudformation",
      "networking",
      "vpc",
      "iam",
    ],
  },
  {
    arc: "Backend / Platform Engineer",
    signals: [
      "backend",
      "api",
      "microservices",
      "node.js",
      "django",
      "fastapi",
      "spring",
      "go ",
      "golang",
      "rust",
      "java ",
      "graphql",
      "rest api",
      "postgres",
      "redis",
      "rabbitmq",
      "system design",
      "scalability",
    ],
  },
  {
    arc: "Frontend / Product Engineer",
    signals: [
      "react",
      "vue",
      "angular",
      "svelte",
      "next.js",
      "tailwind",
      "typescript",
      "frontend",
      "front-end",
      "ui ",
      "spa",
      "redux",
      "webpack",
      "vite",
    ],
  },
  {
    arc: "Mobile Engineer",
    signals: ["android", "ios", "swift", "kotlin", "flutter", "react native", "mobile"],
  },
  {
    arc: "Security / Cybersecurity",
    signals: [
      "cybersecurity",
      "penetration testing",
      "pentest",
      "security",
      "owasp",
      "cryptography",
      "infosec",
      "soc",
      "threat",
      "vulnerability",
      "compliance",
    ],
  },
  {
    arc: "QA / SDET",
    signals: [
      "qa",
      "sdet",
      "selenium",
      "cypress",
      "playwright",
      "jest",
      "pytest",
      "test automation",
      "junit",
      "自动化测试",
    ],
  },
  {
    arc: "Design / UX",
    signals: [
      "ux",
      "ui design",
      "figma",
      "sketch",
      "user research",
      "prototyping",
      "design system",
    ],
  },
  {
    arc: "Product / Strategy",
    signals: [
      "product manager",
      "product owner",
      "roadmap",
      "strategy",
      "stakeholder",
      "agile coach",
    ],
  },
];

/**
 * Classify free text into a high-level role arc. Returns the best match plus a
 * confidence flag when nothing strong matched (so callers can fall back to the
 * officer-supplied default role).
 */
export function classifyRoleArc(text: string): { arc: RoleArc; score: number; matched: string[] } {
  const l = (text ?? "").toLowerCase();
  let best: RoleArc = "Student / Entry-Level (Undecided)";
  let bestScore = 0;
  let bestMatched: string[] = [];

  for (const rule of ROLE_ARC_RULES) {
    const matched = rule.signals.filter((s) => l.includes(s));
    if (matched.length > bestScore) {
      bestScore = matched.length;
      best = rule.arc;
      bestMatched = matched;
    }
  }

  return { arc: best, score: bestScore, matched: bestMatched };
}

/* ----------------------- GenAI / Domestic-AI tool taxonomy ----------------------- */

export type AiToolCategory =
  | "foundation-model" // domestic + global LLM providers
  | "agent-framework" // orchestration / RAG
  | "vector-store" // retrieval
  | "inference-serving" // local/edge serving
  | "gpu-orchestration" // on-prem training/serving
  | "fine-tuning" // customization
  | "multimodal" // image/audio/video gen
  | "ml-platform"; // cloud ML

export type AiToolHit = {
  name: string;
  category: AiToolCategory;
  /** true for China / domestic-AI ecosystem tools (incl. Qwen, DeepSeek, GLM…). */
  domestic: boolean;
};

const AI_TOOL_TABLE: AiToolHit[] = [
  // --- Global foundation models / providers ---
  { name: "openai", category: "foundation-model", domestic: false },
  { name: "gpt-4", category: "foundation-model", domestic: false },
  { name: "gpt-5", category: "foundation-model", domestic: false },
  { name: "chatgpt", category: "foundation-model", domestic: false },
  { name: "claude", category: "foundation-model", domestic: false },
  { name: "anthropic", category: "foundation-model", domestic: false },
  { name: "gemini", category: "foundation-model", domestic: false },
  { name: "palm", category: "foundation-model", domestic: false },
  { name: "llama", category: "foundation-model", domestic: false },
  { name: "mistral", category: "foundation-model", domestic: false },
  { name: "mixtral", category: "foundation-model", domestic: false },
  { name: "cohere", category: "foundation-model", domestic: false },
  { name: "grok", category: "foundation-model", domestic: false },

  // --- Domestic (China) AI ecosystem ---
  { name: "qwen", category: "foundation-model", domestic: true },
  { name: "tongyi", category: "foundation-model", domestic: true },
  { name: "dashscope", category: "foundation-model", domestic: true },
  { name: "deepseek", category: "foundation-model", domestic: true },
  { name: "glm", category: "foundation-model", domestic: true },
  { name: "chatglm", category: "foundation-model", domestic: true },
  { name: "zhipu", category: "foundation-model", domestic: true },
  { name: "ernie", category: "foundation-model", domestic: true },
  { name: "wenxin", category: "foundation-model", domestic: true },
  { name: "baichuan", category: "foundation-model", domestic: true },
  { name: "kimi", category: "foundation-model", domestic: true },
  { name: "moonshot", category: "foundation-model", domestic: true },
  { name: "yi-", category: "foundation-model", domestic: true },
  { name: "01.ai", category: "foundation-model", domestic: true },
  { name: "doubao", category: "foundation-model", domestic: true },
  { name: "abab", category: "foundation-model", domestic: true },
  { name: "minimax", category: "foundation-model", domestic: true },
  { name: "sensechat", category: "foundation-model", domestic: true },
  { name: "step", category: "foundation-model", domestic: true },
  { name: "internlm", category: "foundation-model", domestic: true },
  { name: "falcon", category: "foundation-model", domestic: true },

  // --- Agent / orchestration / RAG frameworks ---
  { name: "langchain", category: "agent-framework", domestic: false },
  { name: "langgraph", category: "agent-framework", domestic: false },
  { name: "llamaindex", category: "agent-framework", domestic: false },
  { name: "semantic kernel", category: "agent-framework", domestic: false },
  { name: "crewai", category: "agent-framework", domestic: false },
  { name: "autogen", category: "agent-framework", domestic: false },
  { name: "dify", category: "agent-framework", domestic: false },
  { name: "cozel", category: "agent-framework", domestic: false },
  { name: "rag", category: "agent-framework", domestic: false },
  { name: "multi-agent", category: "agent-framework", domestic: false },
  { name: "agent", category: "agent-framework", domestic: false },

  // --- Vector stores ---
  { name: "pinecone", category: "vector-store", domestic: false },
  { name: "weaviate", category: "vector-store", domestic: false },
  { name: "chroma", category: "vector-store", domestic: false },
  { name: "milvus", category: "vector-store", domestic: true },
  { name: "tidb", category: "vector-store", domestic: true },
  { name: "faiss", category: "vector-store", domestic: false },
  { name: "qdrant", category: "vector-store", domestic: false },

  // --- Inference serving / on-prem GPU ---
  { name: "vllm", category: "inference-serving", domestic: false },
  { name: "ollama", category: "inference-serving", domestic: false },
  { name: "llamacpp", category: "inference-serving", domestic: false },
  { name: "llama.cpp", category: "inference-serving", domestic: false },
  { name: "sglang", category: "inference-serving", domestic: false },
  { name: "tensorrt", category: "inference-serving", domestic: false },
  { name: "triton", category: "inference-serving", domestic: false },
  { name: "onnx", category: "inference-serving", domestic: false },

  // --- GPU orchestration (domestic stacks are common here) ---
  { name: "cuda", category: "gpu-orchestration", domestic: false },
  { name: "ascend", category: "gpu-orchestration", domestic: true },
  { name: "cann", category: "gpu-orchestration", domestic: true },
  { name: "mindspore", category: "gpu-orchestration", domestic: true },
  { name: "paddle", category: "gpu-orchestration", domestic: true },
  { name: "paddlepaddle", category: "gpu-orchestration", domestic: true },
  { name: "npu", category: "gpu-orchestration", domestic: true },

  // --- Fine-tuning ---
  { name: "peft", category: "fine-tuning", domestic: false },
  { name: "lora", category: "fine-tuning", domestic: false },
  { name: "qlora", category: "fine-tuning", domestic: false },
  { name: "rlhf", category: "fine-tuning", domestic: false },
  { name: "sft", category: "fine-tuning", domestic: false },
  { name: "axolotl", category: "fine-tuning", domestic: false },

  // --- Multimodal generation ---
  { name: "stable diffusion", category: "multimodal", domestic: false },
  { name: "diffusion", category: "multimodal", domestic: false },
  { name: "comfyui", category: "multimodal", domestic: false },
  { name: "midjourney", category: "multimodal", domestic: false },
  { name: "dall-e", category: "multimodal", domestic: false },
  { name: "whisper", category: "multimodal", domestic: false },
  { name: "tts", category: "multimodal", domestic: false },
  { name: "text-to-video", category: "multimodal", domestic: false },

  // --- Cloud ML platforms ---
  { name: "sagemaker", category: "ml-platform", domestic: false },
  { name: "vertex ai", category: "ml-platform", domestic: false },
  { name: "azure ml", category: "ml-platform", domestic: false },
  { name: "bedrock", category: "ml-platform", domestic: false },
  { name: "pai", category: "ml-platform", domestic: true },
  { name: "modelarts", category: "ml-platform", domestic: true },
];

export type ToolTaxonomyResult = {
  hits: AiToolHit[];
  categories: AiToolCategory[];
  hasDomestic: boolean;
  hasGlobal: boolean;
  /** Short human-readable summary, e.g. "Domestic-AI (Qwen, DeepSeek) + RAG". */
  summary: string;
};

/** Detect GenAI / domestic-AI tooling mentioned in any text (JD or resume). */
export function detectAiTools(text: string): ToolTaxonomyResult {
  const l = (text ?? "").toLowerCase();
  const hits: AiToolHit[] = [];
  const seen = new Set<string>();
  for (const t of AI_TOOL_TABLE) {
    if (l.includes(t.name) && !seen.has(t.name)) {
      seen.add(t.name);
      hits.push(t);
    }
  }
  const categories = Array.from(new Set(hits.map((h) => h.category)));
  const hasDomestic = hits.some((h) => h.domestic);
  const hasGlobal = hits.some((h) => !h.domestic);

  const parts: string[] = [];
  if (hasDomestic) {
    const names = hits
      .filter((h) => h.domestic)
      .map((h) => h.name)
      .slice(0, 4);
    parts.push(`Domestic-AI (${names.join(", ")})`);
  }
  if (hasGlobal) {
    const names = hits
      .filter((h) => !h.domestic)
      .map((h) => h.name)
      .slice(0, 4);
    parts.push(`Global-AI (${names.join(", ")})`);
  }
  const catLabel: Record<AiToolCategory, string> = {
    "foundation-model": "Foundation models",
    "agent-framework": "Agent/RAG",
    "vector-store": "Vector stores",
    "inference-serving": "Local inference",
    "gpu-orchestration": "GPU stacks",
    "fine-tuning": "Fine-tuning",
    multimodal: "Multimodal",
    "ml-platform": "ML platforms",
  };
  for (const c of categories) parts.push(catLabel[c]);

  return {
    hits,
    categories,
    hasDomestic,
    hasGlobal,
    summary: parts.length ? parts.join(" + ") : "No GenAI tooling detected",
  };
}
