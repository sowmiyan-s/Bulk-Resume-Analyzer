import { createServerFn } from "@tanstack/react-start";
import {
  FALLBACK_PROVIDER_ORDER,
  getDefaultModelForProvider,
  type ProviderId,
} from "./models";

export interface ProxyLlmPayload {
  provider: ProviderId;
  modelId: string;
  apiKey?: string;
  targetUrl?: string;
  customBaseUrl?: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  maxTokens: number;
  supportsJsonMode?: boolean;
}

interface ProviderVaultKeys {
  lovable?: string | undefined;
  openai?: string | undefined;
  qwen?: string | undefined;
  groq?: string | undefined;
  cerebras?: string | undefined;
  gemini?: string | undefined;
  openrouter?: string | undefined;
  nvidia?: string | undefined;
  litellm?: string | undefined;
  ollama?: string | undefined;
}

async function loadVaultKeys(): Promise<ProviderVaultKeys> {
  const keys: ProviderVaultKeys = {};

  // 1. Query MongoDB Atlas System Vault
  try {
    const { getDb } = await import("./mongodb.server");
    const db = await getDb();
    const config = await db.collection("system_settings").findOne({ key: "global_config" });
    if (config) {
      const { decryptSecret } = await import("./database.server");
      if (typeof config["openaiApiKey"] === "string" && config["openaiApiKey"].trim()) {
        keys.openai = decryptSecret(config["openaiApiKey"].trim());
      }
      if (typeof config["qwenApiKey"] === "string" && config["qwenApiKey"].trim()) {
        keys.qwen = decryptSecret(config["qwenApiKey"].trim());
      }
      if (typeof config["groqApiKey"] === "string" && config["groqApiKey"].trim()) {
        keys.groq = decryptSecret(config["groqApiKey"].trim());
      }
      if (typeof config["cerebrasApiKey"] === "string" && config["cerebrasApiKey"].trim()) {
        keys.cerebras = decryptSecret(config["cerebrasApiKey"].trim());
      }
      if (typeof config["openrouterApiKey"] === "string" && config["openrouterApiKey"].trim()) {
        keys.openrouter = decryptSecret(config["openrouterApiKey"].trim());
      }
      if (typeof config["nvidiaApiKey"] === "string" && config["nvidiaApiKey"].trim()) {
        keys.nvidia = decryptSecret(config["nvidiaApiKey"].trim());
      }
      if (typeof config["geminiApiKey"] === "string" && config["geminiApiKey"].trim()) {
        keys.gemini = decryptSecret(config["geminiApiKey"].trim());
      }
    }
  } catch (e) {
    console.warn("[llm-proxy] Could not query MongoDB system_settings:", e);
  }

  // 2. Fallback to process.env and .env file directly
  let fileEnv: Record<string, string> = {};
  try {
    if (typeof window === "undefined" && typeof process !== "undefined" && process.cwd) {
      const fs = require("node:fs");
      const path = require("node:path");
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
            fileEnv[k] = v;
          }
        }
      }
    }
  } catch {
    /* ignore fallback */
  }

  const getVal = (names: string[]): string | undefined => {
    for (const name of names) {
      const envVal = typeof process !== "undefined" && process.env ? process.env[name]?.trim() : undefined;
      if (envVal) return envVal;
      const fileVal = fileEnv[name]?.trim();
      if (fileVal) return fileVal;
    }
    return undefined;
  };

  const lovable = getVal(["LOVABLE_API_KEY"]);
  if (!keys.lovable && lovable) keys.lovable = lovable;

  const openai = getVal(["OPENAI_API_KEY", "VITE_OPENAI_API_KEY"]);
  if (!keys.openai && openai) keys.openai = openai;

  const qwen = getVal(["QWEN_API_KEY", "DASHSCOPE_API_KEY", "VITE_QWEN_API_KEY"]);
  if (!keys.qwen && qwen) keys.qwen = qwen;

  const groq = getVal(["GROQ_API_KEY", "VITE_GROQ_API_KEY"]);
  if (!keys.groq && groq) keys.groq = groq;

  const cerebras = getVal(["CEREBRAS_API_KEY", "VITE_CEREBRAS_API_KEY"]);
  if (!keys.cerebras && cerebras) keys.cerebras = cerebras;

  const openrouter = getVal(["OPENROUTER_API_KEY", "VITE_OPENROUTER_API_KEY"]);
  if (!keys.openrouter && openrouter) keys.openrouter = openrouter;

  const gemini = getVal(["GEMINI_API_KEY", "VITE_GEMINI_API_KEY"]);
  if (!keys.gemini && gemini) keys.gemini = gemini;

  const nvidia = getVal(["NVIDIA_API_KEY", "VITE_NVIDIA_API_KEY"]);
  if (!keys.nvidia && nvidia) keys.nvidia = nvidia;

  const litellm = getVal(["LITELLM_API_KEY"]) || "sk-litellm";
  if (!keys.litellm && litellm) keys.litellm = litellm;

  return keys;
}

function isRateLimitOrOverload(status: number, errText: string): boolean {
  if (status === 429 || status === 503 || status === 529 || status === 408) {
    return true;
  }
  const lower = errText.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("too many requests") ||
    lower.includes("tokens per minute") ||
    lower.includes("requests per minute") ||
    lower.includes("tpm") ||
    lower.includes("rpm") ||
    lower.includes("overloaded") ||
    lower.includes("capacity exceeded") ||
    lower.includes("service unavailable")
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Serializable response wrapper
export type ProxyLlmResponse = {
  [key: string]: any;
};

async function invokeGemini(
  modelId: string,
  apiKey: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature: number,
  maxTokens: number,
): Promise<ProxyLlmResponse> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => m.content)
    .join("\n\n");

  const res = await fetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (res.ok) {
    return (await res.json()) as ProxyLlmResponse;
  }

  const errText = await res.text().catch(() => "");
  let parsedMsg = errText;
  try {
    const j = JSON.parse(errText);
    parsedMsg = j?.error?.message ?? errText;
  } catch {
    /* raw */
  }

  if (isRateLimitOrOverload(res.status, parsedMsg)) {
    const err = new Error(`Gemini rate limit (${res.status}): ${parsedMsg}`);
    (err as unknown as { status: number; isRateLimit: boolean }).status = res.status;
    (err as unknown as { isRateLimit: boolean }).isRateLimit = true;
    throw err;
  }

  throw new Error(`Gemini API error (${res.status}): ${parsedMsg}`);
}

async function invokeChatCompletions(
  provider: ProviderId,
  modelId: string,
  apiKey: string,
  targetUrl: string | undefined,
  customBaseUrl: string | undefined,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature: number,
  maxTokens: number,
  supportsJsonMode?: boolean,
): Promise<ProxyLlmResponse> {
  let endpoint = targetUrl?.trim();
  let fallbackEndpoint: string | undefined;

  if (!endpoint) {
    if (provider === "lovable") {
      endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
    } else if (provider === "qwen") {
      const envBase =
        typeof process !== "undefined" && process.env
          ? process.env["QWEN_BASE_URL"] || process.env["DASHSCOPE_BASE_URL"]
          : undefined;
      const base = (
        customBaseUrl?.trim() ||
        envBase?.trim() ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1"
      ).replace(/\/+$/, "");
      endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;

      // Dual-region fallback between domestic and international DashScope gateways
      if (!customBaseUrl?.trim() && !envBase?.trim()) {
        fallbackEndpoint =
          "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
      }
    } else if (provider === "openai") {
      endpoint = "https://api.openai.com/v1/chat/completions";
    } else if (provider === "groq") {
      endpoint = "https://api.groq.com/openai/v1/chat/completions";
    } else if (provider === "cerebras") {
      endpoint = "https://api.cerebras.ai/v1/chat/completions";
    } else if (provider === "openrouter") {
      endpoint = "https://openrouter.ai/api/v1/chat/completions";
    } else if (provider === "ollama") {
      endpoint =
        (customBaseUrl?.trim() || "http://localhost:11434/v1").replace(/\/+$/, "") +
        "/chat/completions";
    } else if (provider === "litellm") {
      const base = (customBaseUrl?.trim() || "http://localhost:4000/v1").replace(/\/+$/, "");
      endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
    } else if (provider === "openai-compatible" && customBaseUrl?.trim()) {
      const base = customBaseUrl.trim();
      endpoint = base.endsWith("/chat/completions")
        ? base
        : base.replace(/\/+$/, "") + "/chat/completions";
    } else {
      endpoint = "https://integrate.api.nvidia.com/v1/chat/completions";
    }
  }

  const isDeepSeek = modelId.toLowerCase().includes("deepseek");
  const body: Record<string, unknown> = {
    model: modelId === "custom" ? (customBaseUrl ? "custom" : modelId) : modelId,
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: 0.95,
    stream: false,
    ...(supportsJsonMode && !isDeepSeek && !modelId.toLowerCase().includes("gpt-oss") && !modelId.toLowerCase().includes("compound")
      ? { response_format: { type: "json_object" } }
      : {}),
    ...(isDeepSeek ? { chat_template_kwargs: { thinking: false } } : {}),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    ...(provider === "openrouter"
      ? {
          "HTTP-Referer": "https://resumeradiance.com",
          "X-Title": "Resume Radiance",
        }
      : {}),
  };

  let res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  // Bounded retry with backoff on transient rate limits / overloads before giving up
  for (let attempt = 1; attempt <= 3 && (res.status === 429 || res.status >= 500); attempt++) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 20000)
      : Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 400);
    await sleep(waitMs);
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
  }

  // If primary DashScope endpoint returned 403 (Access denied / region mismatch), try secondary endpoint
  if (!res.ok && (res.status === 403 || res.status === 404) && fallbackEndpoint) {
    try {
      const fbRes = await fetch(fallbackEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
      if (fbRes.ok) {
        return (await fbRes.json()) as ProxyLlmResponse;
      }
    } catch {
      /* ignore secondary error and use primary parsed error */
    }
  }

  if (res.ok) {
    return (await res.json()) as ProxyLlmResponse;
  }

  const errText = await res.text().catch(() => "");
  let parsedErr = errText;
  try {
    const j = JSON.parse(errText);
    parsedErr = String(j?.error?.message ?? j?.message ?? j?.detail ?? errText);
  } catch {
    /* raw */
  }

  if (isRateLimitOrOverload(res.status, parsedErr)) {
    const err = new Error(`${provider.toUpperCase()} rate limit (${res.status}): ${parsedErr}`);
    (err as unknown as { status: number; isRateLimit: boolean }).status = res.status;
    (err as unknown as { isRateLimit: boolean }).isRateLimit = true;
    throw err;
  }

  throw new Error(`${provider.toUpperCase()} API error (${res.status}): ${parsedErr}`);
}

const PROVIDER_MODEL_CASCADES: Record<string, string[]> = {
  openai: [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-3.5-turbo",
  ],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],
  cerebras: [
    "llama3.3-70b",
    "llama3.1-8b",
  ],
  qwen: [
    "qwen-plus",
    "qwen-turbo",
    "qwen-max",
  ],
  gemini: [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
  openrouter: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "deepseek/deepseek-chat",
    "deepseek/deepseek-r1:free",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "qwen/qwen-2.5-72b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
  ],
  nvidia: [
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-8b-instruct",
    "mistralai/mistral-large-2-instruct",
  ],
};

export const executeLlmProxy = createServerFn({ method: "POST" })
  .validator((data: ProxyLlmPayload) => {
    // Input sanitation and guardrails
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
      throw new Error("Invalid request payload: messages array is required.");
    }
    const safeTemp = Math.max(0, Math.min(2, Number(data.temperature) || 0.2));
    const safeTokens = Math.max(50, Math.min(8192, Number(data.maxTokens) || 2000));
    return {
      ...data,
      temperature: safeTemp,
      maxTokens: safeTokens,
    };
  })
  .handler(async ({ data }): Promise<ProxyLlmResponse> => {
    const {
      provider,
      modelId,
      apiKey,
      targetUrl,
      customBaseUrl,
      messages,
      temperature,
      maxTokens,
      supportsJsonMode,
    } = data;

    const vaultKeys = await loadVaultKeys();

    // 1. Determine effective key for primary provider
    let primaryKey = apiKey?.trim() || vaultKeys[provider as keyof ProviderVaultKeys]?.trim();
    if (provider === "lovable") primaryKey = vaultKeys.lovable ?? primaryKey;
    if (provider === "ollama") primaryKey = "ollama-local";
    if (provider === "litellm" && !primaryKey) primaryKey = "sk-litellm";

    const attemptedModels: string[] = [];
    let lastError: unknown = null;

    // Helper: try invoking a model for a specific provider
    const tryModel = async (
      prov: import("./models").ProviderId,
      mId: string,
      key: string,
    ): Promise<ProxyLlmResponse> => {
      attemptedModels.push(`${prov} (${mId})`);
      if (prov === "gemini") {
        return await invokeGemini(mId, key, messages, temperature, maxTokens);
      }
      return await invokeChatCompletions(
        prov,
        mId,
        key,
        targetUrl,
        customBaseUrl,
        messages,
        temperature,
        maxTokens,
        supportsJsonMode,
      );
    };

    // 2. Try primary model and its sibling models within the primary provider
    if (primaryKey || provider === "openai-compatible") {
      const primaryCandidateModels = [
        modelId,
        ...(PROVIDER_MODEL_CASCADES[provider] || []).filter((m) => m !== modelId),
      ];

      for (const candidateModel of primaryCandidateModels) {
        try {
          return await tryModel(provider as import("./models").ProviderId, candidateModel, primaryKey ?? "");
        } catch (err: unknown) {
          lastError = err;
          console.warn(
            `[llm-proxy] Model '${candidateModel}' on '${provider}' hit error/rate-limit. Trying next sibling model or provider...`,
          );
        }
      }
    }

    // 3. Multi-Provider & Sibling Model Fallback Cascade
    // Cascade through all other configured providers in the vault
    const fallbackProviders = FALLBACK_PROVIDER_ORDER.filter(
      (p) =>
        p !== provider &&
        p !== "ollama" &&
        p !== "litellm" &&
        p !== "openai-compatible" &&
        Boolean(vaultKeys[p as keyof ProviderVaultKeys]?.trim()),
    );

    for (const fbProvider of fallbackProviders) {
      const fbKey = vaultKeys[fbProvider as keyof ProviderVaultKeys]?.trim();
      if (!fbKey) continue;

      const fallbackModelList = PROVIDER_MODEL_CASCADES[fbProvider] || [
        getDefaultModelForProvider(fbProvider as import("./models").ProviderId).id,
      ];

      for (const fbModel of fallbackModelList) {
        console.info(
          `[llm-proxy] 🔄 Auto-fallback active: Routing request to '${fbProvider}' (${fbModel})...`,
        );

        try {
          const res = await tryModel(fbProvider as import("./models").ProviderId, fbModel, fbKey);
          console.info(`[llm-proxy] ✅ Fallback to ${fbProvider} (${fbModel}) succeeded!`);
          return res;
        } catch (fbErr: unknown) {
          lastError = fbErr;
          console.warn(
            `[llm-proxy] Fallback model '${fbModel}' on '${fbProvider}' failed or rate-limited. Cascading...`,
          );
          await sleep(350);
        }
      }
    }

    // If all providers and sibling models failed or no keys were configured
    if (!primaryKey && fallbackProviders.length === 0) {
      throw new Error(
        `No API key configured in MongoDB for '${provider}' or any fallback providers. Please log in to the Admin Panel (/admin) to configure your free API keys.`,
      );
    }

    const lastMsg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `All configured AI providers exhausted or rate-limited (Tried: ${attemptedModels.join(", ")}). Error: ${lastMsg}`,
    );
  });
