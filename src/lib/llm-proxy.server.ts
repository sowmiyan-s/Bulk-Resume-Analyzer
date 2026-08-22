import { createServerFn } from "@tanstack/react-start";

export interface ProxyLlmPayload {
  provider: "nvidia" | "gemini" | "litellm" | "openai-compatible";
  modelId: string;
  apiKey: string;
  targetUrl?: string;
  customBaseUrl?: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  maxTokens: number;
  supportsJsonMode?: boolean;
}

export const executeLlmProxy = createServerFn({ method: "POST" })
  .validator((data: ProxyLlmPayload) => data)
  .handler(async ({ data }) => {
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

    let effectiveKey = apiKey?.trim();

    if (!effectiveKey && typeof process !== "undefined") {
      effectiveKey =
        (provider === "gemini"
          ? process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"]
          : provider === "litellm"
            ? process.env["LITELLM_API_KEY"] || "sk-litellm"
            : process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"]) || "";
    }

    if (!effectiveKey) {
      try {
        const { getDb } = await import("./mongodb.server");
        const db = await getDb();
        const config = await db.collection("system_settings").findOne({ key: "global_config" });
        if (config) {
          if (provider === "nvidia" && typeof config["nvidiaApiKey"] === "string") {
            effectiveKey = config["nvidiaApiKey"].trim();
          } else if (provider === "gemini" && typeof config["geminiApiKey"] === "string") {
            effectiveKey = config["geminiApiKey"].trim();
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!effectiveKey && provider !== "litellm" && provider !== "openai-compatible") {
      throw new Error(
        `No API key provided for '${provider}'. Please add your API key in the AI Engine Settings or Admin Panel (/admin).`,
      );
    }

    if (provider === "gemini") {
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
          "x-goog-api-key": effectiveKey,
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
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Gemini API error (${res.status}): ${errText}`);
      }

      return await res.json();
    }

    // Default: NVIDIA NIM, LiteLLM & OpenAI-compatible
    let endpoint = targetUrl?.trim();
    if (!endpoint) {
      if (provider === "litellm") {
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
      ...(supportsJsonMode && !isDeepSeek ? { response_format: { type: "json_object" } } : {}),
      ...(isDeepSeek ? { chat_template_kwargs: { thinking: false } } : {}),
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let parsedErr = errText;
      try {
        const j = JSON.parse(errText);
        parsedErr = String(j?.error?.message ?? j?.message ?? j?.detail ?? errText);
      } catch {
        // Leave parsedErr as raw errText if JSON parsing fails
      }
      throw new Error(`API error (${res.status}): ${parsedErr}`);
    }

    return await res.json();
  });
