/**
 * End-to-end smoke test of the analysis pipeline WITHOUT a live LLM:
 * rule-based ATS engine -> createRuleBasedAnalysis -> normalizeAnalysis.
 * Proves the new roleArc / toolTaxonomy fields flow through to a complete Analysis.
 * Run: npx -y tsx scripts/verify-analysis-pipeline.ts
 */
import { runAtsEngine } from "../src/lib/ats-engine";
import { createRuleBasedAnalysis, normalizeAnalysis } from "../src/lib/analysis-types";

const resume = `
Priya Sharma
priya@college.edu | +91 98765 43210 | github.com/priya
Summary: AI enthusiast building LLM apps.
Skills: Python, PyTorch, LangChain, Qwen, DeepSeek, vLLM, Milvus, PaddlePaddle
Experience:
- Built a RAG chatbot with LlamaIndex, fine-tuned Qwen with LoRA on Ascend NPU (reduced latency 40%).
- Deployed multi-agent system on ModelArts serving 10k req/day.
Projects:
- GenAI tutor using GLM and ERNIE for regional language support.
Education: B.Tech Computer Science, 2024.
`;

const ats = runAtsEngine(resume);
console.log("ATS score:", ats.score);
console.log("roleArc:", ats.metrics.roleArc);
console.log("tool summary:", ats.metrics.toolTaxonomy.summary);

const analysis = createRuleBasedAnalysis(ats, "priya.pdf", resume, undefined, "AI Engineer");
console.log("\n--- Analysis fields ---");
console.log("roleArc:", analysis.roleArc);
console.log("toolTaxonomy.summary:", analysis.toolTaxonomy.summary);
console.log("toolTaxonomy.hasDomestic:", analysis.toolTaxonomy.hasDomestic);
console.log("toolTaxonomy.tools:", analysis.toolTaxonomy.tools.slice(0, 5));
console.log("overallScore:", analysis.overallScore);

// normalize round-trip (simulates what the UI does on hydration)
const norm = normalizeAnalysis(analysis, ats);
console.log("\nnormalized roleArc:", norm.roleArc);
console.log("normalized tools:", norm.toolTaxonomy.tools.length);

const ok =
  analysis.roleArc === "Generative AI / LLM Builder" &&
  analysis.toolTaxonomy.hasDomestic === true &&
  analysis.toolTaxonomy.tools.length > 0 &&
  norm.roleArc === analysis.roleArc;

if (!ok) {
  console.error("\nFAIL: pipeline did not carry role-arc / tool taxonomy");
  process.exit(1);
}
console.log("\nAll pipeline checks passed.");
