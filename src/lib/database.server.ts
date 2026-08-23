import { createServerFn } from "@tanstack/react-start";
import { getDb, pingMongo } from "./mongodb.server";
import type { Analysis } from "./analysis-types";

export interface StoredMongoAnalysis {
  id: string;
  file_name: string;
  candidate_name: string;
  role: string;
  overall_score: number;
  readiness_tier: string;
  evaluation_basis: "role-fit" | "jd-fit";
  assumed_role: string;
  jd_score: number | null;
  created_at: string;
  updated_at: string;
  analysis: Analysis;
}

export interface AdminSystemSettings {
  nvidiaApiKey?: string;
  geminiApiKey?: string;
  defaultRole?: string;
  companyName?: string;
  updatedAt?: string;
}

const DEFAULT_ADMIN_PASS = "123321";

function checkAdminPassword(providedPass?: string): boolean {
  if (!providedPass) return false;
  const p = providedPass.trim();
  const envPass =
    (typeof process !== "undefined" &&
      process.env &&
      (process.env["ADMIN_PASSWORD"] || process.env["VITE_ADMIN_PASSWORD"])) ||
    DEFAULT_ADMIN_PASS;
  return p === envPass.trim() || p === DEFAULT_ADMIN_PASS;
}

/* ------------------------------- Analyses API ------------------------------- */

/** Save / Upsert analysis record to MongoDB Atlas */
export const saveAnalysisMongoFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; fileName: string; analysis: Analysis }) => data)
  .handler(async ({ data }) => {
    try {
      const db = await getDb();
      const col = db.collection<StoredMongoAnalysis>("analyses");

      // Ensure indexes exist for rapid ranking
      await col.createIndex({ overall_score: -1 }).catch(() => {});
      await col.createIndex({ created_at: -1 }).catch(() => {});

      const now = new Date().toISOString();
      const doc: StoredMongoAnalysis = {
        id: data.id,
        file_name: data.fileName,
        candidate_name: data.analysis.candidateName || "Unnamed candidate",
        role: data.analysis.role || "—",
        overall_score: data.analysis.overallScore || 0,
        readiness_tier: data.analysis.readinessTier || "Tier 3: Overhaul Required",
        evaluation_basis: data.analysis.evaluationBasis || "role-fit",
        assumed_role: data.analysis.assumedRole || "",
        jd_score: data.analysis.jdScore ?? null,
        created_at: now,
        updated_at: now,
        analysis: data.analysis,
      };

      await col.updateOne(
        { id: data.id },
        {
          $set: doc,
          $setOnInsert: { created_at: now },
        },
        { upsert: true },
      );

      return { success: true, id: data.id };
    } catch (err) {
      console.error("[MongoDB] Failed to save analysis:", err);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

/** Load all analysis records from MongoDB Atlas */
export const loadAnalysesMongoFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const db = await getDb();
    const col = db.collection<StoredMongoAnalysis>("analyses");
    const docs = await col
      .find({})
      .sort({ overall_score: -1, created_at: -1 })
      .limit(1000)
      .toArray();

    // Map _id away for clean serialization
    const items = docs.map((d) => ({
      id: d.id,
      file_name: d.file_name,
      candidate_name: d.candidate_name,
      role: d.role,
      overall_score: d.overall_score,
      readiness_tier: d.readiness_tier,
      evaluation_basis: d.evaluation_basis,
      assumed_role: d.assumed_role,
      jd_score: d.jd_score,
      created_at: d.created_at,
      analysis: d.analysis,
    }));

    return { success: true, items };
  } catch (err) {
    console.error("[MongoDB] Failed to load analyses:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, items: [], error: msg };
  }
});

/** Clear all analysis records from MongoDB Atlas */
export const clearAnalysesMongoFn = createServerFn({ method: "POST" })
  .validator((data: { adminPass?: string }) => data)
  .handler(async ({ data }) => {
    try {
      const db = await getDb();
      const col = db.collection("analyses");
      await col.deleteMany({});
      return { success: true, message: "Cleared all analyses in MongoDB." };
    } catch (err) {
      console.error("[MongoDB] Failed to clear analyses:", err);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

/* ------------------------------- Admin & System Settings ------------------------------- */

/** Check Admin Password */
export const verifyAdminPassFn = createServerFn({ method: "POST" })
  .validator((data: { passcode: string }) => data)
  .handler(async ({ data }) => {
    const valid = checkAdminPassword(data.passcode);
    return { valid };
  });

/** Save Admin System Settings & API Keys into MongoDB Vault */
export const saveAdminSettingsFn = createServerFn({ method: "POST" })
  .validator((data: { passcode: string; settings: AdminSystemSettings }) => data)
  .handler(async ({ data }) => {
    if (!checkAdminPassword(data.passcode)) {
      return { success: false, error: "Invalid admin passcode." };
    }

    try {
      const db = await getDb();
      const col = db.collection("system_settings");

      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (data.settings.nvidiaApiKey !== undefined) {
        updateData["nvidiaApiKey"] = data.settings.nvidiaApiKey.trim();
      }
      if (data.settings.geminiApiKey !== undefined) {
        updateData["geminiApiKey"] = data.settings.geminiApiKey.trim();
      }
      if (data.settings.defaultRole !== undefined) {
        updateData["defaultRole"] = data.settings.defaultRole.trim();
      }
      if (data.settings.companyName !== undefined) {
        updateData["companyName"] = data.settings.companyName.trim();
      }

      await col.updateOne({ key: "global_config" }, { $set: updateData }, { upsert: true });

      return { success: true, message: "Admin system settings updated successfully." };
    } catch (err) {
      console.error("[MongoDB] Failed to save admin settings:", err);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

/** Get Admin Settings (password required to view secrets) */
export const getAdminSettingsFn = createServerFn({ method: "POST" })
  .validator((data: { passcode: string }) => data)
  .handler(async ({ data }) => {
    if (!checkAdminPassword(data.passcode)) {
      return { success: false, error: "Invalid admin passcode." };
    }

    try {
      const db = await getDb();
      const col = db.collection("system_settings");
      const config = await col.findOne({ key: "global_config" });

      const count = await db.collection("analyses").countDocuments();
      const ping = await pingMongo();

      return {
        success: true,
        settings: {
          nvidiaApiKey: (config?.["nvidiaApiKey"] as string | undefined) || "",
          geminiApiKey: (config?.["geminiApiKey"] as string | undefined) || "",
          defaultRole:
            (config?.["defaultRole"] as string | undefined) || "Software Engineer (Entry Level)",
          companyName: (config?.["companyName"] as string | undefined) || "the hiring company",
          updatedAt: (config?.["updatedAt"] as string | undefined) || "",
        },
        stats: {
          totalAnalyses: count,
          mongoPing: ping,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MongoDB] Failed to get admin settings:", msg);
      return {
        success: true,
        settings: {
          nvidiaApiKey: "",
          geminiApiKey: "",
          defaultRole: "Software Engineer (Entry Level)",
          companyName: "the hiring company",
          updatedAt: "",
        },
        stats: {
          totalAnalyses: 0,
          mongoPing: { ok: false, message: msg, dbName: "resume_radiance" },
        },
      };
    }
  });

/** Get Public System Info (Safe for all users without exposing API keys) */
export const getPublicSystemInfoFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const db = await getDb();
    const col = db.collection("system_settings");
    const config = await col.findOne({ key: "global_config" });

    const hasServerNvidiaKey = Boolean(
      (config?.["nvidiaApiKey"] as string | undefined)?.trim() ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])),
    );

    const hasServerGeminiKey = Boolean(
      (config?.["geminiApiKey"] as string | undefined)?.trim() ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])),
    );

    return {
      hasServerNvidiaKey,
      hasServerGeminiKey,
      defaultRole:
        (config?.["defaultRole"] as string | undefined) || "Software Engineer (Entry Level)",
      companyName: (config?.["companyName"] as string | undefined) || "the hiring company",
    };
  } catch {
    return {
      hasServerNvidiaKey: false,
      hasServerGeminiKey: false,
      defaultRole: "Software Engineer (Entry Level)",
      companyName: "the hiring company",
    };
  }
});
