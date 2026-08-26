/**
 * Live validation script to test all registered models across all providers
 * using keys stored in MongoDB Vault or .env.
 * Run with: npx vite-node scripts/test-all-models.ts
 */

import { MODELS, type ProviderId } from "../src/lib/models";
import { getDb, pingMongo } from "../src/lib/mongodb.server";

async function main() {
  console.log("=================================================================");
  console.log("🔍 RESUME RADIANCE: LIVE MULTI-PROVIDER MODEL VALIDATION REPORT");
  console.log("=================================================================\n");

  // 1. Check MongoDB connectivity & fetch vault keys
  const mongoStatus = await pingMongo();
  console.log(`📦 MongoDB Status: ${mongoStatus.ok ? "Connected (" + mongoStatus.dbName + ")" : "Disconnected (" + mongoStatus.message + ")"}`);

  const vaultKeys: Record<string, string> = {};

  if (mongoStatus.ok) {
    try {
      const db = await getDb();
      const config = await db.collection("system_settings").findOne({ key: "global_config" });
      if (config) {
        if (config["qwenApiKey"]) vaultKeys["qwen"] = String(config["qwenApiKey"]).trim();
        if (config["groqApiKey"]) vaultKeys["groq"] = String(config["groqApiKey"]).trim();
        if (config["cerebrasApiKey"]) vaultKeys["cerebras"] = String(config["cerebrasApiKey"]).trim();
        if (config["openrouterApiKey"]) vaultKeys["openrouter"] = String(config["openrouterApiKey"]).trim();
        if (config["geminiApiKey"]) vaultKeys["gemini"] = String(config["geminiApiKey"]).trim();
        if (config["nvidiaApiKey"]) vaultKeys["nvidia"] = String(config["nvidiaApiKey"]).trim();
      }
    } catch (e) {
      console.warn("Could not read from MongoDB system_settings:", e);
    }
  }

  // Fallback to process.env
  if (typeof process !== "undefined" && process.env) {
    if (!vaultKeys["qwen"]) {
      vaultKeys["qwen"] = (process.env["QWEN_API_KEY"] || process.env["DASHSCOPE_API_KEY"] || process.env["VITE_QWEN_API_KEY"] || "").trim();
    }
    if (!vaultKeys["groq"]) {
      vaultKeys["groq"] = (process.env["GROQ_API_KEY"] || process.env["VITE_GROQ_API_KEY"] || "").trim();
    }
    if (!vaultKeys["cerebras"]) {
      vaultKeys["cerebras"] = (process.env["CEREBRAS_API_KEY"] || process.env["VITE_CEREBRAS_API_KEY"] || "").trim();
    }
    if (!vaultKeys["openrouter"]) {
      vaultKeys["openrouter"] = (process.env["OPENROUTER_API_KEY"] || process.env["VITE_OPENROUTER_API_KEY"] || "").trim();
    }
    if (!vaultKeys["gemini"]) {
      vaultKeys["gemini"] = (process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"] || "").trim();
    }
    if (!vaultKeys["nvidia"]) {
      vaultKeys["nvidia"] = (process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"] || "").trim();
    }
  }

  console.log("\n🔑 Active API Keys in Vault / Environment:");
  for (const prov of ["qwen", "groq", "cerebras", "gemini", "openrouter", "nvidia"]) {
    const k = vaultKeys[prov];
    const masked = k ? `${k.slice(0, 4)}••••••••${k.slice(-4)} (${k.length} chars)` : "❌ Not Set";
    console.log(`  - ${prov.toUpperCase().padEnd(12)}: ${masked}`);
  }

  console.log("\n=================================================================");
  console.log("🧪 TESTING MODELS ONE BY ONE");
  console.log("=================================================================\n");

  const results: Array<{
    provider: ProviderId;
    modelId: string;
    label: string;
    status: "PASS" | "FAIL" | "SKIPPED_NO_KEY";
    latencyMs?: number;
    error?: string;
  }> = [];

  for (const m of MODELS) {
    if (m.provider === "ollama" || m.provider === "litellm" || m.provider === "openai-compatible") {
      continue;
    }

    const key = vaultKeys[m.provider];
    if (!key) {
      results.push({
        provider: m.provider,
        modelId: m.id,
        label: m.label,
        status: "SKIPPED_NO_KEY",
      });
      continue;
    }

    const t0 = Date.now();
    try {
      if (m.provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m.id}:generateContent`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
          signal: AbortSignal.timeout(15000),
        });
        const elapsed = Date.now() - t0;
        if (res.ok) {
          results.push({ provider: m.provider, modelId: m.id, label: m.label, status: "PASS", latencyMs: elapsed });
        } else {
          const err = await res.text().catch(() => "");
          results.push({ provider: m.provider, modelId: m.id, label: m.label, status: "FAIL", latencyMs: elapsed, error: `HTTP ${res.status}: ${err.slice(0, 120)}` });
        }
      } else {
        // OpenAI-compatible providers
        let endpoint = "https://integrate.api.nvidia.com/v1/chat/completions";
        let altEndpoint: string | undefined;

        if (m.provider === "qwen") {
          endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
          altEndpoint = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
        } else if (m.provider === "groq") {
          endpoint = "https://api.groq.com/openai/v1/chat/completions";
        } else if (m.provider === "cerebras") {
          endpoint = "https://api.cerebras.ai/v1/chat/completions";
        } else if (m.provider === "openrouter") {
          endpoint = "https://openrouter.ai/api/v1/chat/completions";
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          ...(m.provider === "openrouter" ? { "HTTP-Referer": "https://resumeradiance.com", "X-Title": "Resume Radiance" } : {}),
        };

        const body = {
          model: m.id,
          messages: [{ role: "user", content: "Reply 'OK' only." }],
          max_tokens: 10,
          temperature: 0.1,
        };

        let res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        });

        if (!res.ok && (res.status === 403 || res.status === 404) && altEndpoint) {
          res = await fetch(altEndpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(20000),
          });
        }

        const elapsed = Date.now() - t0;
        if (res.ok) {
          results.push({ provider: m.provider, modelId: m.id, label: m.label, status: "PASS", latencyMs: elapsed });
        } else {
          const err = await res.text().catch(() => "");
          results.push({ provider: m.provider, modelId: m.id, label: m.label, status: "FAIL", latencyMs: elapsed, error: `HTTP ${res.status}: ${err.slice(0, 150)}` });
        }
      }
    } catch (e) {
      const elapsed = Date.now() - t0;
      results.push({
        provider: m.provider,
        modelId: m.id,
        label: m.label,
        status: "FAIL",
        latencyMs: elapsed,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Print results grouped by provider
  let currentProv = "";
  for (const r of results) {
    if (r.provider !== currentProv) {
      currentProv = r.provider;
      console.log(`\n--- [${currentProv.toUpperCase()}] ---`);
    }

    if (r.status === "PASS") {
      console.log(`  ✅ PASS  [${r.latencyMs}ms] ${r.modelId.padEnd(35)} -> ${r.label}`);
    } else if (r.status === "FAIL") {
      console.log(`  ❌ FAIL  [${r.latencyMs}ms] ${r.modelId.padEnd(35)} -> Error: ${r.error}`);
    } else {
      console.log(`  ⚠️ SKIP  (No API Key in Vault) ${r.modelId.padEnd(35)} -> ${r.label}`);
    }
  }

  // Check models endpoints for available active models from Groq / Cerebras / OpenRouter / DashScope
  console.log("\n=================================================================");
  console.log("📡 FETCHING ACTIVE MODEL CATALOGUES FROM PROVIDER APIS");
  console.log("=================================================================\n");

  if (vaultKeys["groq"]) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${vaultKeys["groq"]}` },
      });
      if (res.ok) {
        const j = (await res.json()) as { data: Array<{ id: string }> };
        console.log("⚡ Groq Available Models (" + j.data.length + "):");
        console.log("   " + j.data.map((d) => d.id).join(", "));
      }
    } catch {
      /* ignore */
    }
  }

  if (vaultKeys["cerebras"]) {
    try {
      const res = await fetch("https://api.cerebras.ai/v1/models", {
        headers: { Authorization: `Bearer ${vaultKeys["cerebras"]}` },
      });
      if (res.ok) {
        const j = (await res.json()) as { data: Array<{ id: string }> };
        console.log("🚀 Cerebras Available Models (" + j.data.length + "):");
        console.log("   " + j.data.map((d) => d.id).join(", "));
      }
    } catch {
      /* ignore */
    }
  }

  if (vaultKeys["openrouter"]) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${vaultKeys["openrouter"]}` },
      });
      if (res.ok) {
        const j = (await res.json()) as { data: Array<{ id: string; pricing?: { prompt: string; completion: string } }> };
        const freeModels = j.data.filter((d) => d.id.endsWith(":free") || (d.pricing?.prompt === "0" && d.pricing?.completion === "0"));
        console.log("🔀 OpenRouter Free Models (" + freeModels.length + "):");
        console.log("   " + freeModels.map((d) => d.id).join("\n   "));
      }
    } catch {
      /* ignore */
    }
  }

  if (vaultKeys["nvidia"]) {
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
        headers: { Authorization: `Bearer ${vaultKeys["nvidia"]}` },
      });
      if (res.ok) {
        const j = (await res.json()) as { data: Array<{ id: string }> };
        console.log("🟢 NVIDIA Available Models (" + j.data.length + "):");
        console.log("   " + j.data.map((d) => d.id).join(", "));
      } else {
        const err = await res.text();
        console.log("🟢 NVIDIA Models fetch error:", res.status, err);
      }
    } catch (e) {
      console.log("🟢 NVIDIA Models exception:", e);
    }
  }

  console.log("\n=================================================================");
  console.log("Validation complete.");
  console.log("=================================================================\n");
}

main().catch(console.error);
