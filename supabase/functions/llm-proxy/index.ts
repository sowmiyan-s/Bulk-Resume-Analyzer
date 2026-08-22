// Supabase Edge Function: CORS proxy for LLM providers.
//
// Why this exists: NVIDIA NIM (integrate.api.nvidia.com) does not send
// Access-Control-Allow-Origin headers, so a browser tab cannot call it directly.
// This function forwards the request and adds CORS headers. It is free on
// Supabase and keeps the site itself 100% static.
//
// Deploy:
//   supabase functions deploy llm-proxy --no-verify-jwt
//
// Then paste the function URL into the app's "Proxy URL" setting:
//   https://<project-ref>.supabase.co/functions/v1/llm-proxy
//
// The browser sends the user's own API key in the Authorization header and this
// function passes it straight through — no secrets are stored here. If you would
// rather keep the key server-side, set the NVIDIA_API_KEY / GEMINI_API_KEY
// secrets and the function will use them when the client sends no key:
//   supabase secrets set NVIDIA_API_KEY=nvapi-xxxx

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: { message: "Use POST." } }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: { message: "Body must be JSON." } }, 400);
  }

  const provider = String(payload["provider"] ?? "nvidia");
  const clientKey = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  try {
    if (provider === "gemini") {
      const key = clientKey || Deno.env.get("GEMINI_API_KEY") || "";
      if (!key) return json({ error: { message: "No Gemini API key supplied." } }, 401);

      const model = String(payload["model"] ?? "gemini-2.5-flash");
      const messages = (payload["messages"] ?? []) as Array<{ role: string; content: string }>;
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      const user = messages
        .filter((m) => m.role !== "system")
        .map((m) => m.content)
        .join("\n\n");

      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: Number(payload["temperature"] ?? 0.25),
            maxOutputTokens: Number(payload["max_tokens"] ?? 2600),
            responseMimeType: "application/json",
          },
        }),
      });
      return new Response(await res.text(), {
        status: res.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Default: OpenAI-compatible (NVIDIA NIM, Groq, OpenRouter, vLLM…)
    const key = clientKey || Deno.env.get("NVIDIA_API_KEY") || "";
    if (!key) return json({ error: { message: "No API key supplied." } }, 401);

    const target = String(payload["target_url"] ?? NVIDIA_URL);
    const { provider: _p, target_url: _t, ...body } = payload;

    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      body: JSON.stringify({ ...body, stream: false }),
    });

    return new Response(await res.text(), {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json(
      { error: { message: `Proxy request failed: ${e instanceof Error ? e.message : String(e)}` } },
      502,
    );
  }
});
