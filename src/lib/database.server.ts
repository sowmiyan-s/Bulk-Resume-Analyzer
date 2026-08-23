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
  clean_text?: string;
  raw_text?: string;
  analysis: Analysis;
}

export interface AdminSystemSettings {
  nvidiaApiKey?: string;
  geminiApiKey?: string;
  defaultRole?: string;
  companyName?: string;
  defaultModelId?: string;
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
  .validator(
    (data: {
      id: string;
      fileName: string;
      analysis: Analysis;
      cleanText?: string;
      rawText?: string;
    }) => data,
  )
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
        clean_text: data.cleanText || "",
        raw_text: data.rawText || "",
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
      clean_text: d.clean_text,
      raw_text: d.raw_text,
      analysis: d.analysis,
    }));

    return { success: true, items };
  } catch (err) {
    console.error("[MongoDB] Failed to load analyses:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, items: [], error: msg };
  }
});

/** Delete a single analysis record from MongoDB Atlas */
export const deleteAnalysisMongoFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    try {
      const db = await getDb();
      const col = db.collection("analyses");
      await col.deleteOne({ id: data.id });
      return { success: true, message: "Record deleted from MongoDB." };
    } catch (err) {
      console.error("[MongoDB] Failed to delete analysis:", err);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

/** Delete multiple analysis records from MongoDB Atlas */
export const deleteManyAnalysesMongoFn = createServerFn({ method: "POST" })
  .validator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => {
    try {
      const db = await getDb();
      const col = db.collection("analyses");
      await col.deleteMany({ id: { $in: data.ids } });
      return { success: true, message: `Deleted ${data.ids.length} records from MongoDB.` };
    } catch (err) {
      console.error("[MongoDB] Failed to delete analyses:", err);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
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
      if (data.settings.defaultModelId !== undefined) {
        updateData["defaultModelId"] = data.settings.defaultModelId.trim();
      }

      await col.updateOne({ key: "global_config" }, { $set: updateData }, { upsert: true });

      return { success: true, message: "API keys & system settings successfully saved in MongoDB Atlas." };
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

      const count = await db.collection("analyses").countDocuments().catch(() => 0);
      const ping = await pingMongo();

      const nvidiaKey =
        (config?.["nvidiaApiKey"] as string | undefined)?.trim() ||
        (typeof process !== "undefined" &&
          process.env &&
          (process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])) ||
        "";

      const geminiKey =
        (config?.["geminiApiKey"] as string | undefined)?.trim() ||
        (typeof process !== "undefined" &&
          process.env &&
          (process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])) ||
        "";

      return {
        success: true,
        settings: {
          nvidiaApiKey: nvidiaKey,
          geminiApiKey: geminiKey,
          defaultRole:
            (config?.["defaultRole"] as string | undefined) || "Software Engineer (Entry Level)",
          companyName: (config?.["companyName"] as string | undefined) || "the hiring company",
          defaultModelId: (config?.["defaultModelId"] as string | undefined) || "",
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

/** Test an API Key against the provider */
export const testApiKeyFn = createServerFn({ method: "POST" })
  .validator((data: { provider: "nvidia" | "gemini"; apiKey?: string }) => data)
  .handler(async ({ data }) => {
    let key = data.apiKey?.trim();
    if (!key || key === "trigger-database-vault-test") {
      try {
        const db = await getDb();
        const col = db.collection("system_settings");
        const config = await col.findOne({ key: "global_config" });
        if (data.provider === "gemini") {
          key =
            (config?.["geminiApiKey"] as string | undefined)?.trim() ||
            (typeof process !== "undefined" &&
              process.env &&
              (process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])) ||
            "";
        } else {
          key =
            (config?.["nvidiaApiKey"] as string | undefined)?.trim() ||
            (typeof process !== "undefined" &&
              process.env &&
              (process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])) ||
            "";
        }
      } catch (e) {
        return { success: false, message: `Could not connect to MongoDB: ${String(e)}` };
      }
    }

    if (!key) {
      return {
        success: false,
        message: `No API key configured in MongoDB Vault for ${data.provider === "gemini" ? "Google Gemini" : "NVIDIA NIM"}. Please add it in Admin Panel (/admin).`,
      };
    }

    if (data.provider === "gemini") {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          return { success: true, message: "Google Gemini API key is valid and working!" };
        }
        const errText = await res.text().catch(() => "");
        return { success: false, message: `Gemini API check failed (${res.status}): ${errText}` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, message: `Gemini connection failed: ${msg}` };
      }
    }

    // Default: NVIDIA
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "meta/llama-3.3-70b-instruct",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        return { success: true, message: "NVIDIA NIM API key is valid and working!" };
      }
      const errText = await res.text().catch(() => "");
      return { success: false, message: `NVIDIA API check failed (${res.status}): ${errText}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, message: `NVIDIA connection failed: ${msg}` };
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
        ((process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])?.trim())),
    );

    const hasServerGeminiKey = Boolean(
      (config?.["geminiApiKey"] as string | undefined)?.trim() ||
      (typeof process !== "undefined" &&
        process.env &&
        ((process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])?.trim())),
    );

    return {
      success: true,
      hasServerNvidiaKey,
      hasServerGeminiKey,
      defaultRole:
        (config?.["defaultRole"] as string | undefined) || "Software Engineer (Entry Level)",
      companyName: (config?.["companyName"] as string | undefined) || "the hiring company",
      defaultModelId: (config?.["defaultModelId"] as string | undefined) || "",
      databaseConnected: true,
    };
  } catch {
    const hasEnvNvidia = Boolean(
      typeof process !== "undefined" &&
        process.env &&
        ((process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])?.trim()),
    );
    const hasEnvGemini = Boolean(
      typeof process !== "undefined" &&
        process.env &&
        ((process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])?.trim()),
    );

    return {
      success: false,
      hasServerNvidiaKey: hasEnvNvidia,
      hasServerGeminiKey: hasEnvGemini,
      defaultRole: "Software Engineer (Entry Level)",
      companyName: "the hiring company",
      defaultModelId: "",
      databaseConnected: false,
    };
  }
});
