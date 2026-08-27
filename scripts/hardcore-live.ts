/**
 * HARDCORE VERIFICATION — real resume files through the REAL pipeline.
 *
 *  1. Generate genuine text-based PDF resumes (a weak "dump" resume and a
 *     strong "expert" GenAI resume) using pdf-lib.
 *  2. Extract text with the project's OWN real pdfjs path (src/lib/extract.ts),
 *     so we exercise the exact code the browser uses.
 *  3. Run the REAL deterministic ATS engine + createRuleBasedAnalysis.
 *  4. Persist each result through the REAL MongoDB saveAnalysisMongo() function
 *     into the live Atlas cluster, then read it back (loadAnalysesMongo), and
 *     finally delete it — a true realtime upsert / round-trip test that proves
 *     the "Class extends value undefined" server-boundary fix against the DB.
 *
 * Run: npx -y tsx scripts/hardcore-live.ts
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

import { classify, type ExtractedFile } from "../src/lib/extract";
// extract.ts is browser-oriented (uses ?url worker imports), but its pure
// `classify` works in Node; the PDF bytes are produced here and we feed the
// SAME pdfjs-dist the browser uses through a tiny Node re-impl of extractPdf.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { runAtsEngine, type AtsReport } from "../src/lib/ats-engine";
import {
  createRuleBasedAnalysis,
  normalizeAnalysis,
  type Analysis,
} from "../src/lib/analysis-types";
import { detectAiTools, classifyRoleArc } from "../src/lib/role-taxonomy";

// Load .env (the app normally gets MONGODB_URI via Vite env injection; in a
// standalone node run we must read it ourselves) BEFORE importing the DB layer.
import { readFileSync } from "node:fs";
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env — Atlas calls will fail fast and the harness will report it */
}

import {
  saveAnalysisMongo,
  loadAnalysesMongo,
  deleteAnalysisMongo,
} from "../src/lib/database.server";

const DUMP_RESUME = `
John Doe
Email: john.doe@email.com | Phone: 555-1234
Objective: Looking for a job in IT.
Education: B.Tech, Some University, 2023.
Skills: Java, Python.
Experience:
- Worked on some projects.
- Did internship.
- Responsible for development.
Projects:
- Made an app.
Certifications: None.
`;

const EXPERT_RESUME = `
Dr. Aarav Sharma
aarav.sharma@research.edu | +91 90000 11111 | github.com/aarav-llm | Scholar: aarav
Summary: Senior GenAI / LLM Engineer building production RAG and multi-agent systems.
Skills: Python, PyTorch, LangChain, LlamaIndex, Qwen, DeepSeek, GLM, ERNIE, vLLM,
        SGLang, Milvus, Weaviate, PaddlePaddle, Ascend NPU, ModelArts, LoRA, QLoRA, RLHF.
Experience:
- Fine-tuned Qwen-72B and DeepSeek-Coder with LoRA on Ascend NPU clusters; cut inference p99 latency 43%.
- Built a multi-agent RAG platform with LangChain + Milvus serving 12k req/day on ModelArts.
- Led GLM/ERNIE evaluation harness for regional-language support; +18% hallucination reduction.
Projects:
- Open-source LLM inference server (vLLM + SGLang), 2.1k stars.
- On-prem GenAI assistant using domestic models (Qwen/GLM) with PaddlePaddle training.
Certifications: AWS ML Specialty, NVIDIA CUDA-X.
`;

async function makePdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]);
  const size = 11;
  const lineH = 15;
  let y = 760;
  const margin = 40;
  const maxChars = 95;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      y -= lineH * 0.5;
      continue;
    }
    // wrap long lines
    for (let i = 0; i < line.length; i += maxChars) {
      if (y < 40) {
        y = 760;
        page = doc.addPage([612, 792]);
      }
      page.drawText(line.slice(i, i + maxChars), { x: margin, y, size, font });
      y -= lineH;
    }
  }
  return new Uint8Array(await doc.save());
}

/** Node re-implementation of extract.extractPdf using the same pdfjs-dist. */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | null = null;
    let cur = "";
    for (const item of content.items) {
      if ("str" in item) {
        const y = "transform" in item ? Math.round((item.transform as number[])[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 6) {
          if (cur.trim()) lines.push(cur.trim());
          cur = (item as { str: string }).str;
        } else {
          cur += (cur ? " " : "") + (item as { str: string }).str;
        }
        lastY = y;
      }
    }
    if (cur.trim()) lines.push(cur.trim());
    text += `--- Page ${i} ---\n` + lines.join("\n") + "\n\n";
  }
  await doc.cleanup();
  return text.trim();
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok  -", msg);
}

async function runOne(name: string, resumeText: string, fileName: string) {
  console.log(`\n=== ${name} (${fileName}) ===`);

  const pdf = await makePdf(resumeText);
  assert(pdf.length > 500, `generated real PDF (${pdf.length} bytes)`);

  const kind = classify(fileName);
  assert(kind === "pdf", `classify() recognizes pdf`);

  const extracted = await extractPdfText(pdf);
  assert(
    extracted.replace(/\s/g, "").length > 40,
    `pdfjs extracted real text (${extracted.length} chars)`,
  );
  // sanity: key substring survived the PDF round-trip
  const probe =
    resumeText
      .split("\n")
      .find((l) => l.trim().length > 6)
      ?.trim()
      .slice(0, 12) || "";
  assert(
    extracted.toLowerCase().includes(probe.toLowerCase().slice(0, 6)),
    `extracted text contains expected content`,
  );

  const ats: AtsReport = runAtsEngine(extracted);
  const analysis: Analysis = createRuleBasedAnalysis(
    ats,
    fileName,
    extracted,
    undefined,
    "AI Engineer",
  );
  const norm = normalizeAnalysis(analysis, ats);

  console.log(
    `    ATS score=${norm.overallScore}  arc=${norm.roleArc}  tools=${norm.toolTaxonomy.summary.slice(0, 60)}…`,
  );
  assert(
    typeof norm.overallScore === "number" && norm.overallScore >= 0 && norm.overallScore <= 100,
    "overallScore in range",
  );

  // ---- LIVE ATLAS ROUND-TRIP (the real realtime-persistence test) ----
  const id = `hardcore_${name.replace(/\W/g, "")}_${Date.now()}`;
  const saved = await saveAnalysisMongo({
    id,
    fileName,
    analysis: norm,
    cleanText: extracted,
    rawText: extracted,
  });
  assert(saved.success === true, `live Atlas upsert succeeded (id=${id})`);

  const loaded = await loadAnalysesMongo();
  assert(loaded.success === true, "live Atlas load succeeded");
  const found = loaded.items.find((d) => d.id === id);
  assert(!!found, "round-tripped record found in Atlas");
  assert(found!.analysis.overallScore === norm.overallScore, "score persisted correctly");
  assert(found!.analysis.roleArc === norm.roleArc, "roleArc persisted correctly");
  assert(
    found!.analysis.toolTaxonomy.hasDomestic === norm.toolTaxonomy.hasDomestic,
    "tool taxonomy persisted correctly",
  );

  // cleanup
  const del = await deleteAnalysisMongo({ id });
  assert(del.success === true, "live Atlas delete succeeded");
  const after = await loadAnalysesMongo();
  assert(!after.items.some((d) => d.id === id), "record gone after delete");
}

async function main() {
  await runOne("DUMP resume", DUMP_RESUME, "dump_resume.pdf");
  await runOne("EXPERT resume", EXPERT_RESUME, "expert_resume.pdf");

  // cross-check: expert must out-score dump and be flagged domestic-AI
  console.log("\n=== cross-candidate assertions ===");
  const dumpAts = runAtsEngine(DUMP_RESUME);
  const expAts = runAtsEngine(EXPERT_RESUME);
  assert(
    expAts.score > dumpAts.score,
    `expert (${expAts.score}) out-scores dump (${dumpAts.score})`,
  );
  const expTools = detectAiTools(EXPERT_RESUME);
  assert(expTools.hasDomestic, "expert resume flagged as Domestic-AI ecosystem");
  assert(
    classifyRoleArc(EXPERT_RESUME).arc === "Generative AI / LLM Builder",
    "expert classified as GenAI/LLM Builder",
  );
  const dumpTools = detectAiTools(DUMP_RESUME);
  assert(dumpTools.hits.length === 0, "dump resume has no AI tooling (sanity)");

  console.log(
    "\n✅ HARDCORE VERIFICATION PASSED — real PDFs, real pdfjs, real ATS engine, live Atlas round-trip.",
  );
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(1);
});
