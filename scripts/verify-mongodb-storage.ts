import { readFileSync } from "node:fs";

try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
} catch {}

import { pingMongo } from "../src/lib/mongodb.server";
import {
  saveAnalysisMongo,
  loadAnalysesMongo,
  deleteAnalysisMongo,
  saveAdminSettings,
  getAdminSettings,
  getPublicSystemInfo,
} from "../src/lib/database.server";
import type { Analysis } from "../src/lib/analysis-types";

async function main() {
  console.log("=================================================");
  console.log("🚀 STARTING FULL MONGODB SERVER INTEGRATION SUITE");
  console.log("=================================================\n");

  // 1. Ping MongoDB Atlas
  console.log("[1/6] Testing MongoDB Atlas Connection & Ping...");
  const ping = await pingMongo();
  console.log("Ping response:", ping);
  if (!ping.ok) {
    throw new Error(`MongoDB Ping Failed: ${ping.message}`);
  }
  console.log(`✅ MongoDB Atlas Connection Verified (DB: ${ping.dbName}, Latency: ${ping.latencyMs}ms)\n`);

  // 2. Insert Sample Analysis Record
  console.log("[2/6] Testing Analysis Insertion (saveAnalysisMongo)...");
  const testId = `test-verify-${Date.now()}`;
  const sampleAnalysis: Analysis = {
    candidateName: "Jane Doe (Verification Test)",
    role: "Senior AI Engineer",
    overallScore: 94,
    readinessTier: "Tier 1: Shortlist Ready",
    summary: "Exceptional candidate with proven track record in distributed systems and LLMs.",
    strengths: ["Strong TypeScript", "Distributed Systems", "MongoDB Optimization"],
    gaps: ["None critical"],
    sections: {
      experience: { score: 95, notes: "10+ years" },
      skills: { score: 92, notes: "Expert tier" },
      education: { score: 90, notes: "MS Computer Science" },
    },
    redFlags: [],
    customFields: {},
    evaluationBasis: "role-fit",
    assumedRole: "Senior AI Engineer",
    jdScore: null,
  };

  const insertRes = await saveAnalysisMongo({
    id: testId,
    fileName: "jane_doe_resume.pdf",
    analysis: sampleAnalysis,
    cleanText: "Clean extracted resume text here...",
    rawText: "Raw resume text here...",
  });

  if (!insertRes.success) {
    throw new Error(`Failed to insert analysis: ${insertRes.error}`);
  }
  console.log(`✅ Analysis Insert Succeeded with ID: ${insertRes.id}\n`);

  // 3. Test Upsert / Update without Conflict (Testing Bug Fix)
  console.log("[3/6] Testing Analysis Update / Upsert without $set / $setOnInsert conflict...");
  const updatedAnalysis: Analysis = {
    ...sampleAnalysis,
    overallScore: 96,
    officerNotes: "Recruiter reviewed and approved.",
  };

  const updateRes = await saveAnalysisMongo({
    id: testId,
    fileName: "jane_doe_resume_v2.pdf",
    analysis: updatedAnalysis,
    cleanText: "Updated clean extracted text...",
    rawText: "Updated raw text...",
  });

  if (!updateRes.success) {
    throw new Error(`Failed to update analysis: ${updateRes.error}`);
  }
  console.log(`✅ Analysis Update Succeeded without conflict! (ID: ${updateRes.id})\n`);

  // 4. Test Loading Analyses & Serialization
  console.log("[4/6] Testing loadAnalysesMongo and data serialization...");
  const loadRes = await loadAnalysesMongo();
  if (!loadRes.success || !Array.isArray(loadRes.items)) {
    throw new Error(`Failed to load analyses: ${loadRes.error}`);
  }

  const found = loadRes.items.find((item) => item.id === testId);
  if (!found) {
    throw new Error(`Saved test record ${testId} was not found in loaded analyses list!`);
  }
  console.log(`Found loaded record:`, {
    id: found.id,
    candidate_name: found.candidate_name,
    overall_score: found.overall_score,
    readiness_tier: found.readiness_tier,
    created_at: found.created_at,
    updated_at: found.updated_at,
  });
  if (found.overall_score !== 96) {
    throw new Error(`Expected score 96, got ${found.overall_score}`);
  }
  console.log(`✅ Successfully loaded and verified ${loadRes.items.length} records from MongoDB Atlas!\n`);

  // 5. Test Admin Settings Vault & Public Info
  console.log("[5/6] Testing System Settings Vault & Public Info...");
  const publicInfo = await getPublicSystemInfo();
  console.log("Public System Info:", publicInfo);
  if (!publicInfo.databaseConnected) {
    throw new Error("getPublicSystemInfo reported databaseConnected: false");
  }

  const adminSettings = await getAdminSettings({ passcode: "123321" });
  if (!adminSettings.success) {
    throw new Error(`Failed to get admin settings: ${adminSettings.error}`);
  }
  console.log("Admin Settings stats:", adminSettings.stats);
  console.log(`✅ System Settings Vault & Public Info Verified!\n`);

  // 6. Test Deleting the Test Analysis Record
  console.log("[6/6] Testing Record Deletion (deleteAnalysisMongo)...");
  const deleteRes = await deleteAnalysisMongo({ id: testId });
  if (!deleteRes.success) {
    throw new Error(`Failed to delete analysis: ${deleteRes.error}`);
  }

  // Confirm deleted
  const verifyDeleted = await loadAnalysesMongo();
  const stillExists = verifyDeleted.items?.some((i) => i.id === testId);
  if (stillExists) {
    throw new Error(`Test record ${testId} still exists after deletion!`);
  }
  console.log(`✅ Record successfully deleted and cleaned up from MongoDB Atlas.\n`);

  console.log("=================================================");
  console.log("🎉 ALL MONGODB DATA STORAGE CHECKS PASSED SAFELY!");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("\n❌ MONGODB VERIFICATION FAILED:", err);
  process.exit(1);
});
