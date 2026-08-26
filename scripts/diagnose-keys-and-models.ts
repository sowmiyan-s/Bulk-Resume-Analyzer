import { getDb } from "../src/lib/mongodb.server";

async function main() {
  const db = await getDb();
  const config = await db.collection("system_settings").findOne({ key: "global_config" });

  console.log("=== API KEY VAULT DIAGNOSTIC ===");
  console.log("qwenApiKey      :", config?.qwenApiKey ? `${config.qwenApiKey.slice(0, 8)}... (${config.qwenApiKey.length} chars)` : "NOT SET");
  console.log("groqApiKey      :", config?.groqApiKey ? `${config.groqApiKey.slice(0, 8)}... (${config.groqApiKey.length} chars)` : "NOT SET");
  console.log("nvidiaApiKey    :", config?.nvidiaApiKey ? `${config.nvidiaApiKey.slice(0, 8)}... (${config.nvidiaApiKey.length} chars)` : "NOT SET");
  console.log("openrouterApiKey:", config?.openrouterApiKey ? `${config.openrouterApiKey.slice(0, 8)}... (${config.openrouterApiKey.length} chars)` : "NOT SET");
  console.log("cerebrasApiKey  :", config?.cerebrasApiKey ? `${config.cerebrasApiKey.slice(0, 8)}... (${config.cerebrasApiKey.length} chars)` : "NOT SET");
  console.log("geminiApiKey    :", config?.geminiApiKey ? `${config.geminiApiKey.slice(0, 8)}... (${config.geminiApiKey.length} chars)` : "NOT SET");
  console.log("================================\n");

  const qwenKey = String(config?.qwenApiKey || "").trim();
  if (qwenKey) {
    const endpoints = [
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
      "https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions",
      "https://dashscope-ap-southeast.aliyuncs.com/compatible-mode/v1/chat/completions",
    ];

    const models = [
      "qwen-plus",
      "qwen-turbo",
      "qwen-max",
      "qwen-plus-latest",
      "qwen-turbo-latest",
      "qwen2.5-72b-instruct",
      "qwen2.5-32b-instruct",
      "qwen2.5-14b-instruct",
      "qwen2.5-7b-instruct",
      "qwen2.5-coder-32b-instruct",
      "qwen2.5-coder-7b-instruct",
      "qwen-long",
      "qwen-flash",
    ];

    console.log("🔍 PROBING QWEN ENDPOINTS & MODELS...");
    for (const ep of endpoints) {
      const epName = ep.replace("https://", "").split("/")[0];
      console.log(`\n--- Endpoint: ${epName} ---`);
      for (const m of models) {
        try {
          const res = await fetch(ep, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${qwenKey}`,
            },
            body: JSON.stringify({
              model: m,
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 5,
            }),
            signal: AbortSignal.timeout(6000),
          });
          if (res.ok) {
            const data = await res.json();
            console.log(`  ✅ [${m}] SUCCESS! Output: ${data?.choices?.[0]?.message?.content?.slice(0, 30)}`);
          } else {
            const err = await res.text();
            const errCode = err.includes("AccessDenied.Unpurchased")
              ? "AccessDenied.Unpurchased"
              : err.includes("InvalidApiKey")
              ? "InvalidApiKey"
              : err.includes("ModelNotFound")
              ? "ModelNotFound"
              : err.slice(0, 45);
            console.log(`  ❌ [${m}] (${res.status}): ${errCode}`);
          }
        } catch (e: any) {
          console.log(`  ❌ [${m}] Error: ${e.message?.slice(0, 40)}`);
        }
      }
    }
  }
}

main().catch(console.error);
