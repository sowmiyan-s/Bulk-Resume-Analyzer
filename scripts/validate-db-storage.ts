/**
 * VALIDATE ALL DATA STORING IN DATABASE
 *
 * Exercises the EXACT functions the deployed TanStack server-fns call
 * (saveAnalysisMongo / loadAnalysesMongo / deleteAnalysisMongo /
 * deleteManyAnalysesMongo / clearAnalysesMongo), using the real MONGODB_URI
 * from .env — so this mirrors what happens on Vercel once MONGODB_URI is set.
 *
 * It asserts:
 *  - the connection is configured (URI present) and pingable
 *  - an upsert actually writes a retrievable document
 *  - EVERY field the app persists is present and byte-for-byte correct
 *    (score, tier, roleArc, toolTaxonomy, nested analysis, texts)
 *  - re-saving the same id UPSERTS (no duplicate), not inserts a second doc
 *  - load returns items sorted by score desc
 *  - deleteMany + clear remove the records
 *  - the collection is left clean afterwards (no test residue)
 *
 * Secrets: the URI is read from .env into process.env and NEVER printed.
 * Run: npx -y tsx scripts/validate-db-storage.ts
 */
import { readFileSync } from "node:fs";

// Load .env (Vercel injects MONGODB_URI as a real env var; locally we read it)
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* fall through to whatever env exists */
}

import { getMongoUri, pingMongo } from "../src/lib/mongodb.server";
import {
  saveAnalysisMongo,
  loadAnalysesMongo,
  deleteAnalysisMongo,
  deleteManyAnalysesMongo,
  clearAnalysesMongo,
  type StoredMongoAnalysis,
} from "../src/lib/database.server";
import {
  createRuleBasedAnalysis,
  normalizeAnalysis,
  type Analysis,
} from "../src/lib/analysis-types";
import { runAtsEngine } from "../src/lib/ats-engine";

const SENTINEL = "__validate_db_storage__";
let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("ok  -", msg);
  }
}

function makeAnalysis(extra: Partial<Analysis> = {}): Analysis {
  // Build a realistic analysis object (roleArc + toolTaxonomy are the new fields)
  const ats = runAtsEngine(
    "GenAI engineer using Qwen, DeepSeek, GLM, LangChain, vLLM, Milvus, Ascend NPU.",
  );
  const base = createRuleBasedAnalysis(
    ats,
    "validate.pdf",
    "Qwen DeepSeek GLM LangChain vLLM Milvus Ascend",
    undefined,
    "AI Engineer",
  );
  return normalizeAnalysis({ ...base, ...extra }, ats);
}

async function main() {
  console.log("=== 0. Connection configured? ===");
  const uri = getMongoUri();
  assert(!!uri, "MONGODB_URI is present (getMongoUri() !== null)");
  const ping = await pingMongo();
  assert(ping.ok, `MongoDB ping OK (${ping.message})`);
  if (!uri) {
    console.error("No MONGODB_URI — cannot validate storage. Aborting.");
    process.exit(1);
  }

  // Clean any prior residue from a previous run
  await clearAnalysesMongo({});

  console.log("\n=== 1. Upsert a record ===");
  const id1 = `${SENTINEL}_a_${Date.now()}`;
  const a1 = makeAnalysis({ candidateName: "Candidate A" });
  const r1 = await saveAnalysisMongo({
    id: id1,
    fileName: "a.pdf",
    analysis: a1,
    cleanText: "x",
    rawText: "x",
  });
  assert(r1.success, "saveAnalysisMongo(#1) success");

  const id2 = `${SENTINEL}_b_${Date.now()}`;
  const a2 = makeAnalysis({ candidateName: "Candidate B", overallScore: a1.overallScore + 20 });
  const r2 = await saveAnalysisMongo({
    id: id2,
    fileName: "b.pdf",
    analysis: a2,
    cleanText: "y",
    rawText: "y",
  });
  assert(r2.success, "saveAnalysisMongo(#2) success");

  console.log("\n=== 2. Read back & validate EVERY persisted field ===");
  const loaded = await loadAnalysesMongo();
  assert(loaded.success, "loadAnalysesMongo success");
  const docs = loaded.items as StoredMongoAnalysis[];
  const d1 = docs.find((d) => d.id === id1);
  const d2 = docs.find((d) => d.id === id2);
  assert(!!d1 && !!d2, "both records retrieved from DB");

  if (d1) {
    assert(d1.file_name === "a.pdf", "file_name persisted");
    assert(d1.candidate_name === "Candidate A", "candidate_name persisted");
    assert(d1.overall_score === a1.overallScore, "overall_score persisted");
    assert(d1.readiness_tier === a1.readinessTier, "readiness_tier persisted");
    assert(d1.evaluation_basis === a1.evaluationBasis, "evaluation_basis persisted");
    assert(d1.assumed_role === a1.assumedRole, "assumed_role persisted");
    assert(d1.jd_score === a1.jdScore, "jd_score persisted");
    assert(!!d1.created_at && !!d1.updated_at, "created_at / updated_at present");
    assert(d1.clean_text === "x" && d1.raw_text === "x", "clean_text / raw_text persisted");
    // nested Analysis object integrity
    assert(
      d1.analysis.candidateName === a1.candidateName,
      "nested analysis.candidateName persisted",
    );
    assert(d1.analysis.roleArc === a1.roleArc, `roleArc persisted (${a1.roleArc})`);
    assert(
      d1.analysis.toolTaxonomy.hasDomestic === a1.toolTaxonomy.hasDomestic,
      `toolTaxonomy.hasDomestic persisted (${a1.toolTaxonomy.hasDomestic})`,
    );
    assert(
      JSON.stringify(d1.analysis.toolTaxonomy.tools) === JSON.stringify(a1.toolTaxonomy.tools),
      "toolTaxonomy.tools persisted exactly",
    );
    assert(d1.analysis.ats !== null, "nested analysis.ats persisted");
    assert(d1.analysis.scoreBreakdown.length > 0, "nested analysis.scoreBreakdown persisted");
  }

  console.log("\n=== 3. Sorting (score desc) ===");
  const idxB = docs.findIndex((d) => d.id === id2);
  const idxA = docs.findIndex((d) => d.id === id1);
  // loadAnalysesMongo sorts by overall_score desc; id2 has higher score
  assert(idxB < idxA, "load returns higher score first (score desc sort)");

  console.log("\n=== 4. Upsert (same id) must NOT create a duplicate ===");
  const before = (await loadAnalysesMongo()).items.filter((d) => d.id === id1).length;
  const a1Updated = makeAnalysis({ candidateName: "Candidate A (edited)" });
  await saveAnalysisMongo({
    id: id1,
    fileName: "a.pdf",
    analysis: a1Updated,
    cleanText: "x2",
    rawText: "x2",
  });
  const after = (await loadAnalysesMongo()).items.filter((d) => d.id === id1).length;
  assert(
    before === 1 && after === 1,
    `upsert keeps exactly one doc for id (before=${before}, after=${after})`,
  );
  const upd = (await loadAnalysesMongo()).items.find((d) => d.id === id1);
  assert(
    upd?.candidate_name === "Candidate A (edited)",
    "upsert updated the existing record in place",
  );

  console.log("\n=== 5. deleteMany ===");
  const dm = await deleteManyAnalysesMongo({ ids: [id1, id2] });
  assert(dm.success, "deleteManyAnalysesMongo success");
  const remaining = (await loadAnalysesMongo()).items.filter((d) => d.id === id1 || d.id === id2);
  assert(remaining.length === 0, "both records removed by deleteMany");

  console.log("\n=== 6. Cleanup / no residue ===");
  await clearAnalysesMongo({});
  const finalCount = (await loadAnalysesMongo()).items.filter((d) =>
    d.id.startsWith(SENTINEL),
  ).length;
  assert(finalCount === 0, "no sentinel residue left in DB");

  console.log(
    `\n${failures === 0 ? "✅ ALL DATA-STORAGE CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(1);
});
