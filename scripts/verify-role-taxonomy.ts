/**
 * Quick sanity check for the role-arc + GenAI / domestic-AI tool taxonomy.
 * Run with: npx tsx scripts/verify-role-taxonomy.ts   (or node --import tsx)
 */
import { classifyRoleArc, detectAiTools } from "../src/lib/role-taxonomy";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok  -", msg);
}

// 1. GenAI builder resume mentioning domestic models + RAG
const genaiResume = `
Senior AI Engineer building RAG pipelines with LangChain and LlamaIndex.
Fine-tuned Qwen and DeepSeek with LoRA on Ascend NPU clusters.
Deployed agents with vLLM and Milvus vector store.
`;
const arc = classifyRoleArc(genaiResume);
assert(
  arc.arc === "Generative AI / LLM Builder" || arc.arc === "AI / ML Engineer",
  `role arc = ${arc.arc}`,
);
const tools = detectAiTools(genaiResume);
assert(tools.hasDomestic, "detected domestic-AI (Qwen/DeepSeek/Ascend)");
assert(tools.hasGlobal, "detected global tooling (LangChain/vLLM/Milvus)");
assert(tools.summary.includes("Domestic-AI"), `summary: ${tools.summary}`);

// 2. A JD that ONLY mentions domestic AI should still be understood
const jdDomestic = `
We need an LLM engineer fluent in GLM, ChatGLM and ERNIE, deploying on
ModelArts with PaddlePaddle, building multi-agent systems.
`;
const jdTools = detectAiTools(jdDomestic);
assert(jdTools.hasDomestic, "JD with GLM/ERNIE/ModelArts/Paddle flagged domestic");
assert(
  jdTools.hits.some((h) => ["glm", "ernie", "chatglm", "paddle", "modelarts"].includes(h.name)),
  "domestic tool names captured",
);

// 3. Plain backend resume -> different arc, no domestic
const backend = `Backend engineer using Java, Spring Boot, PostgreSQL, Docker, Kubernetes.`;
const bArc = classifyRoleArc(backend);
assert(bArc.arc === "Backend / Platform Engineer", `backend arc = ${bArc.arc}`);
assert(detectAiTools(backend).hits.length === 0, "no AI tools in plain backend resume");

console.log("\nAll role-taxonomy checks passed.");
