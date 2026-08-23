import { createServerFn } from "@tanstack/react-start";

export interface ProxyLlmPayload {
  provider:
    | "groq"
    | "cerebras"
    | "openrouter"
    | "ollama"
    | "nvidia"
    | "gemini"
    | "litellm"
    | "openai-compatible";
  modelId: string;
  apiKey?: string;
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

    // 1. Retrieve API key exclusively from MongoDB Atlas System Vault
    if (!effectiveKey) {
      try {
        const { getDb } = await import("./mongodb.server");
        const db = await getDb();
        const config = await db.collection("system_settings").findOne({ key: "global_config" });
        if (config) {
          if (provider === "groq" && typeof config["groqApiKey"] === "string" && config["groqApiKey"].trim()) {
            effectiveKey = config["groqApiKey"].trim();
          } else if (provider === "cerebras" && typeof config["cerebrasApiKey"] === "string" && config["cerebrasApiKey"].trim()) {
            effectiveKey = config["cerebrasApiKey"].trim();
          } else if (provider === "openrouter" && typeof config["openrouterApiKey"] === "string" && config["openrouterApiKey"].trim()) {
            effectiveKey = config["openrouterApiKey"].trim();
          } else if (provider === "nvidia" && typeof config["nvidiaApiKey"] === "string" && config["nvidiaApiKey"].trim()) {
            effectiveKey = config["nvidiaApiKey"].trim();
          } else if (provider === "gemini" && typeof config["geminiApiKey"] === "string" && config["geminiApiKey"].trim()) {
            effectiveKey = config["geminiApiKey"].trim();
          }
        }
      } catch (e) {
        console.warn("[llm-proxy] Could not query MongoDB system_settings:", e);
      }
    }

    // 2. Fallback to process.env if available
    if (!effectiveKey && typeof process !== "undefined" && process.env) {
      if (provider === "groq") {
        effectiveKey = (process.env["GROQ_API_KEY"] || process.env["VITE_GROQ_API_KEY"])?.trim();
      } else if (provider === "cerebras") {
        effectiveKey = (process.env["CEREBRAS_API_KEY"] || process.env["VITE_CEREBRAS_API_KEY"])?.trim();
      } else if (provider === "openrouter") {
        effectiveKey = (process.env["OPENROUTER_API_KEY"] || process.env["VITE_OPENROUTER_API_KEY"])?.trim();
      } else if (provider === "gemini") {
        effectiveKey = (process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])?.trim();
      } else if (provider === "litellm") {
        effectiveKey = (process.env["LITELLM_API_KEY"] || "sk-litellm")?.trim();
      } else {
        effectiveKey = (process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])?.trim();
      }
    }

    if (provider === "ollama") {
      effectiveKey = "ollama-local";
    }

    if (provider === "litellm" && !effectiveKey) {
      effectiveKey = "sk-litellm";
    }

    if (!effectiveKey && provider !== "litellm" && provider !== "openai-compatible" && provider !== "ollama") {
      throw new Error(
        `No API key configured in MongoDB for '${provider}'. Please log in to the Admin Panel (/admin) to configure your free API key.`,
      );
    }

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    if (provider === "gemini") {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      const user = messages
        .filter((m) => m.role !== "system")
        .map((m) => m.content)
        .join("\n\n");

      let lastErrText = "";
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": effectiveKey ?? "",
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

        if (res.ok) {
          return await res.json();
        }

        lastErrText = await res.text().catch(() => "");
        if ((res.status === 429 || res.status === 503) && attempt < 3) {
          // Automatic exponential backoff: 3s, 6s
          await sleep(attempt * 3000);
          continue;
        }

        let parsedMsg = lastErrText;
        try {
          const j = JSON.parse(lastErrText);
          parsedMsg = j?.error?.message ?? lastErrText;
        } catch {
          /* raw text */
        }
        throw new Error(`Gemini API error (${res.status}): ${parsedMsg}`);
      }
    }

    // Default: Groq, Cerebras, OpenRouter, Ollama, NVIDIA NIM, LiteLLM & OpenAI-compatible
    let endpoint = targetUrl?.trim();
    if (!endpoint) {
      if (provider === "groq") {
        endpoint = "https://api.groq.com/openai/v1/chat/completions";
      } else if (provider === "cerebras") {
        endpoint = "https://api.cerebras.ai/v1/chat/completions";
      } else if (provider === "openrouter") {
        endpoint = "https://openrouter.ai/api/v1/chat/completions";
      } else if (provider === "ollama") {
        endpoint = (customBaseUrl?.trim() || "http://localhost:11434/v1").replace(/\/+$/, "") + "/chat/completions";
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
      ...(supportsJsonMode && !isDeepSeek ? { response_format: { type: "json_object" } } : {}),
      ...(isDeepSeek ? { chat_template_kwargs: { thinking: false } } : {}),
    };

    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
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

      if (res.ok) {
        return await res.json();
      }

      const errText = await res.text().catch(() => "");
      let parsedErr = errText;
      try {
        const j = JSON.parse(errText);
        parsedErr = String(j?.error?.message ?? j?.message ?? j?.detail ?? errText);
      } catch {
        // Leave parsedErr as raw errText if JSON parsing fails
      }
      lastErr = parsedErr;

      if ((res.status === 429 || res.status === 503) && attempt < 3) {
        // Automatic exponential backoff for rate limits: 3s, 6s
        await sleep(attempt * 3000);
        continue;
      }

      throw new Error(`API error (${res.status}): ${parsedErr}`);
    }

    throw new Error(`API error: ${lastErr}`);
  });
