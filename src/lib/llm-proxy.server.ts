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

  // 2. Fallback to process.env if available
  if (typeof process !== "undefined" && process.env) {
    const lovable = process.env["LOVABLE_API_KEY"]?.trim();
    if (!keys.lovable && lovable) keys.lovable = lovable;

    const qwen = (process.env["QWEN_API_KEY"] || process.env["DASHSCOPE_API_KEY"] || process.env["VITE_QWEN_API_KEY"])?.trim();
    if (!keys.qwen && qwen) keys.qwen = qwen;

    const groq = (process.env["GROQ_API_KEY"] || process.env["VITE_GROQ_API_KEY"])?.trim();
    if (!keys.groq && groq) keys.groq = groq;

    const cerebras = (process.env["CEREBRAS_API_KEY"] || process.env["VITE_CEREBRAS_API_KEY"])?.trim();
    if (!keys.cerebras && cerebras) keys.cerebras = cerebras;

    const openrouter = (process.env["OPENROUTER_API_KEY"] || process.env["VITE_OPENROUTER_API_KEY"])?.trim();
    if (!keys.openrouter && openrouter) keys.openrouter = openrouter;

    const gemini = (process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])?.trim();
    if (!keys.gemini && gemini) keys.gemini = gemini;

    const nvidia = (process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])?.trim();
    if (!keys.nvidia && nvidia) keys.nvidia = nvidia;

    const litellm = (process.env["LITELLM_API_KEY"] || "sk-litellm")?.trim();
    if (!keys.litellm && litellm) keys.litellm = litellm;
  }

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

    // 2. Try primary model first
    const attemptedProviders: string[] = [];
    let lastError: unknown = null;

    if (primaryKey || provider === "openai-compatible") {
      attemptedProviders.push(`${provider} (${modelId})`);
      try {
        if (provider === "gemini") {
          return await invokeGemini(modelId, primaryKey ?? "", messages, temperature, maxTokens);
        }
        return await invokeChatCompletions(
          provider,
          modelId,
          primaryKey ?? "",
          targetUrl,
          customBaseUrl,
          messages,
          temperature,
          maxTokens,
          supportsJsonMode,
        );
      } catch (err: unknown) {
        lastError = err;
        console.warn(
          `[llm-proxy] Primary provider '${provider}' hit an error (${err instanceof Error ? err.message : String(err)}). Cascading to available vault providers...`,
        );
      }
    }

    // 3. Multi-Provider Fallback Cascade
    // If the primary provider hit a rate limit or had no key, cascade through all other configured providers
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

      const fbModelOption = getDefaultModelForProvider(fbProvider);
      attemptedProviders.push(`${fbProvider} (${fbModelOption.id})`);
      console.info(
        `[llm-proxy] 🔄 Auto-fallback active: Routing request to '${fbProvider}' (${fbModelOption.id})...`,
      );

      try {
        if (fbProvider === "gemini") {
          const res = await invokeGemini(
            fbModelOption.id,
            fbKey,
            messages,
            temperature,
            maxTokens,
          );
          console.info(`[llm-proxy] ✅ Fallback to Gemini (${fbModelOption.id}) succeeded!`);
          return res;
        }

        const res = await invokeChatCompletions(
          fbProvider,
          fbModelOption.id,
          fbKey,
          undefined,
          undefined,
          messages,
          temperature,
          maxTokens,
          fbModelOption.supportsJsonMode,
        );
        console.info(`[llm-proxy] ✅ Fallback to ${fbProvider} (${fbModelOption.id}) succeeded!`);
        return res;
      } catch (fbErr: unknown) {
        lastError = fbErr;
        console.warn(
          `[llm-proxy] Fallback provider '${fbProvider}' also rate-limited: ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`,
        );
        await sleep(500);
      }
    }

    // If all providers failed or no keys were found
    if (!primaryKey && fallbackProviders.length === 0) {
      throw new Error(
        `No API key configured in MongoDB for '${provider}' or any fallback providers. Please log in to the Admin Panel (/admin) to configure your free API keys.`,
      );
    }

    const lastMsg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `All configured AI providers exhausted or rate-limited (Tried: ${attemptedProviders.join(", ")}). Error: ${lastMsg}`,
    );
  });
