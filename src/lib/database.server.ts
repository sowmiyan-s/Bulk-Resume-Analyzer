import { createServerFn } from "@tanstack/react-start";
import type { Analysis } from "./analysis-types";

async function getDb() {
  const { getDb: dbFn } = await import("./mongodb.server");
  return dbFn();
}

async function pingMongo() {
  const { pingMongo: pingFn } = await import("./mongodb.server");
  return pingFn();
}

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
  qwenApiKey?: string;
  groqApiKey?: string;
  cerebrasApiKey?: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
  nvidiaApiKey?: string;
  defaultRole?: string;
  companyName?: string;
  defaultModelId?: string;
  updatedAt?: string;
}

import crypto from "crypto";

export function checkAdminPassword(providedPass?: string): boolean {
  if (!providedPass) return false;
  const p = providedPass.trim();
  const envPass =
    typeof process !== "undefined" && process.env
      ? (process.env["ADMIN_PASSWORD"] || process.env["VITE_ADMIN_PASSWORD"])?.trim()
      : undefined;
  if (!envPass) return false;
  return p === envPass;
}

function maskSecret(key?: string): string {
  if (!key || typeof key !== "string") return "";
  const trimmed = decryptSecret(key.trim());
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

function isMasked(key?: string): boolean {
  return typeof key === "string" && key.includes("••••");
}

const ENCRYPTION_PREFIX = "enc::";

function getEncryptionKey(): Buffer {
  const secret =
    (typeof process !== "undefined" && process.env && (process.env["ENCRYPTION_SECRET"] || process.env["ADMIN_PASSWORD"])) ||
    "resume-radiance-default-key-32b-str";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText?: string): string {
  if (!plainText || typeof plainText !== "string" || !plainText.trim()) return "";
  const trimmed = plainText.trim();
  if (trimmed.startsWith(ENCRYPTION_PREFIX) || isMasked(trimmed)) return trimmed;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(trimmed, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${ENCRYPTION_PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch {
    return trimmed;
  }
}

export function decryptSecret(cipherText?: string): string {
  if (!cipherText || typeof cipherText !== "string" || !cipherText.trim()) return "";
  const trimmed = cipherText.trim();
  if (!trimmed.startsWith(ENCRYPTION_PREFIX)) return trimmed;

  try {
    const key = getEncryptionKey();
    const parts = trimmed.slice(ENCRYPTION_PREFIX.length).split(":");
    if (parts.length !== 3) return trimmed;
    const iv = Buffer.from(parts[0]!, "hex");
    const authTag = Buffer.from(parts[1]!, "hex");
    const encryptedText = parts[2]!;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return trimmed;
  }
}

/* ------------------------------- Pure Database Operations ------------------------------- */

/** Save or Upsert an analysis record directly into MongoDB */
export async function saveAnalysisMongo(data: {
  id: string;
  fileName: string;
  analysis: Analysis;
  cleanText?: string | undefined;
  rawText?: string | undefined;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = await getDb();
    const col = db.collection<StoredMongoAnalysis>("analyses");

    // Ensure indexes exist for rapid ranking & lookup
    void Promise.allSettled([
      col.createIndex({ id: 1 }, { unique: true }),
      col.createIndex({ file_name: 1 }),
      col.createIndex({ overall_score: -1 }),
      col.createIndex({ created_at: -1 }),
    ]);

    const now = new Date().toISOString();
    const fileName = (data.fileName || "unknown.pdf").trim();
    const updatePayload = {
      file_name: fileName,
      candidate_name: data.analysis.candidateName || "Unnamed candidate",
      role: data.analysis.role || "—",
      overall_score: typeof data.analysis.overallScore === "number" ? data.analysis.overallScore : 0,
      readiness_tier: data.analysis.readinessTier || "Tier 3: Overhaul Required",
      evaluation_basis: data.analysis.evaluationBasis || "role-fit",
      assumed_role: data.analysis.assumedRole || "",
      jd_score: typeof data.analysis.jdScore === "number" ? data.analysis.jdScore : null,
      updated_at: now,
      clean_text: data.cleanText || "",
      raw_text: data.rawText || "",
      analysis: data.analysis,
    };

    // Match by file_name first (case-insensitive) or id to prevent duplicate entries for the same resume
    const matchFilter = fileName
      ? { $or: [{ file_name: fileName }, { file_name: new RegExp(`^${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }, { id: data.id }] }
      : { id: data.id };

    await col.updateOne(
      matchFilter,
      {
        $set: updatePayload,
        $setOnInsert: { id: data.id, created_at: now },
      },
      { upsert: true },
    );

    return { success: true, id: data.id };
  } catch (err) {
    console.error("[MongoDB] Failed to save analysis:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/** Load all analysis records directly from MongoDB with strict file_name deduplication */
export async function loadAnalysesMongo(): Promise<{
  success: boolean;
  items: Array<Omit<StoredMongoAnalysis, "_id">>;
  error?: string;
}> {
  try {
    const db = await getDb();
    const col = db.collection<StoredMongoAnalysis>("analyses");
    const docs = await col
      .find({})
      .sort({ updated_at: -1, created_at: -1 })
      .limit(1000)
      .toArray();

    // Deduplicate docs by file_name so each resume only ever appears once
    const seenFiles = new Map<string, StoredMongoAnalysis>();
    for (const d of docs) {
      const key = (d.file_name || d.id || "").trim().toLowerCase();
      if (!key) continue;
      if (!seenFiles.has(key)) {
        seenFiles.set(key, d);
      }
    }

    // Clean serialization mapping
    const items = Array.from(seenFiles.values()).map((d) => ({
      id: d.id,
      file_name: d.file_name || "candidate.pdf",
      candidate_name: d.candidate_name || "Unnamed candidate",
      role: d.role || "—",
      overall_score: typeof d.overall_score === "number" ? d.overall_score : 0,
      readiness_tier: d.readiness_tier || "Tier 3: Overhaul Required",
      evaluation_basis: d.evaluation_basis || "role-fit",
      assumed_role: d.assumed_role || "",
      jd_score: typeof d.jd_score === "number" ? d.jd_score : null,
      created_at: d.created_at || new Date().toISOString(),
      updated_at: d.updated_at || d.created_at || new Date().toISOString(),
      clean_text: d.clean_text || "",
      raw_text: d.raw_text || "",
      analysis: d.analysis,
    }));

    return { success: true, items };
  } catch (err) {
    console.error("[MongoDB] Failed to load analyses:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, items: [], error: msg };
  }
}

/** Delete single analysis directly from MongoDB */
export async function deleteAnalysisMongo(data: {
  id: string;
  passcode?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
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
}

/** Delete multiple analyses directly from MongoDB */
export async function deleteManyAnalysesMongo(data: {
  ids: string[];
  passcode?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
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
}

/** Clear all analyses directly from MongoDB */
export async function clearAnalysesMongo(data?: {
  adminPass?: string;
  passcode?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
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
}

/** Save Admin Settings directly into MongoDB Vault */
export async function saveAdminSettings(data: {
  passcode: string;
  settings: AdminSystemSettings;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!checkAdminPassword(data.passcode)) {
    return { success: false, error: "Invalid admin passcode." };
  }

  try {
    const db = await getDb();
    const col = db.collection("system_settings");

    void col.createIndex({ key: 1 }, { unique: true }).catch(() => {});

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.settings.qwenApiKey !== undefined && !isMasked(data.settings.qwenApiKey)) {
      updateData["qwenApiKey"] = encryptSecret(data.settings.qwenApiKey.trim());
    }
    if (data.settings.groqApiKey !== undefined && !isMasked(data.settings.groqApiKey)) {
      updateData["groqApiKey"] = encryptSecret(data.settings.groqApiKey.trim());
    }
    if (data.settings.cerebrasApiKey !== undefined && !isMasked(data.settings.cerebrasApiKey)) {
      updateData["cerebrasApiKey"] = encryptSecret(data.settings.cerebrasApiKey.trim());
    }
    if (data.settings.openrouterApiKey !== undefined && !isMasked(data.settings.openrouterApiKey)) {
      updateData["openrouterApiKey"] = encryptSecret(data.settings.openrouterApiKey.trim());
    }
    if (data.settings.nvidiaApiKey !== undefined && !isMasked(data.settings.nvidiaApiKey)) {
      updateData["nvidiaApiKey"] = encryptSecret(data.settings.nvidiaApiKey.trim());
    }
    if (data.settings.geminiApiKey !== undefined && !isMasked(data.settings.geminiApiKey)) {
      updateData["geminiApiKey"] = encryptSecret(data.settings.geminiApiKey.trim());
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
}

/** Get Admin Settings directly from MongoDB */
export async function getAdminSettings(data: { passcode: string }): Promise<{
  success: boolean;
  settings?: AdminSystemSettings;
  stats?: {
    totalAnalyses: number;
    mongoPing: { ok: boolean; message: string; dbName: string; latencyMs?: number };
  };
  error?: string;
}> {
  if (!checkAdminPassword(data.passcode)) {
    return { success: false, error: "Invalid admin passcode." };
  }

  try {
    const db = await getDb();
    const col = db.collection("system_settings");
    const config = await col.findOne({ key: "global_config" });

    const count = await db.collection("analyses").countDocuments().catch(() => 0);
    const ping = await pingMongo();

    const qwenKey =
      decryptSecret((config?.["qwenApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env["QWEN_API_KEY"] || process.env["DASHSCOPE_API_KEY"] || process.env["VITE_QWEN_API_KEY"])) ||
      "";

    const groqKey =
      decryptSecret((config?.["groqApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env["GROQ_API_KEY"] || process.env["VITE_GROQ_API_KEY"])) ||
      "";

    const cerebrasKey =
      decryptSecret((config?.["cerebrasApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env["CEREBRAS_API_KEY"] || process.env["VITE_CEREBRAS_API_KEY"])) ||
      "";

    const openrouterKey =
      decryptSecret((config?.["openrouterApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env["OPENROUTER_API_KEY"] || process.env["VITE_OPENROUTER_API_KEY"])) ||
      "";

    const nvidiaKey =
      decryptSecret((config?.["nvidiaApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])) ||
      "";

    const geminiKey =
      decryptSecret((config?.["geminiApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])) ||
      "";

    return {
      success: true,
      settings: {
        qwenApiKey: maskSecret(qwenKey),
        groqApiKey: maskSecret(groqKey),
        cerebrasApiKey: maskSecret(cerebrasKey),
        openrouterApiKey: maskSecret(openrouterKey),
        nvidiaApiKey: maskSecret(nvidiaKey),
        geminiApiKey: maskSecret(geminiKey),
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
        qwenApiKey: "",
        groqApiKey: "",
        cerebrasApiKey: "",
        openrouterApiKey: "",
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
}

/** Get Public System Info directly */
export async function getPublicSystemInfo(): Promise<{
  success: boolean;
  hasServerQwenKey: boolean;
  hasServerGroqKey: boolean;
  hasServerCerebrasKey: boolean;
  hasServerOpenRouterKey: boolean;
  hasServerNvidiaKey: boolean;
  hasServerGeminiKey: boolean;
  defaultRole: string;
  companyName: string;
  defaultModelId: string;
  databaseConnected: boolean;
}> {
  try {
    const db = await getDb();
    const col = db.collection("system_settings");
    const config = await col.findOne({ key: "global_config" });

    const hasServerQwenKey = Boolean(
      decryptSecret((config?.["qwenApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        ((process.env["QWEN_API_KEY"] || process.env["DASHSCOPE_API_KEY"] || process.env["VITE_QWEN_API_KEY"])?.trim())),
    );

    const hasServerGroqKey = Boolean(
      decryptSecret((config?.["groqApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        ((process.env["GROQ_API_KEY"] || process.env["VITE_GROQ_API_KEY"])?.trim())),
    );

    const hasServerCerebrasKey = Boolean(
      decryptSecret((config?.["cerebrasApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        ((process.env["CEREBRAS_API_KEY"] || process.env["VITE_CEREBRAS_API_KEY"])?.trim())),
    );

    const hasServerOpenRouterKey = Boolean(
      decryptSecret((config?.["openrouterApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        ((process.env["OPENROUTER_API_KEY"] || process.env["VITE_OPENROUTER_API_KEY"])?.trim())),
    );

    const hasServerNvidiaKey = Boolean(
      decryptSecret((config?.["nvidiaApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        ((process.env["NVIDIA_API_KEY"] || process.env["VITE_NVIDIA_API_KEY"])?.trim())),
    );

    const hasServerGeminiKey = Boolean(
      decryptSecret((config?.["geminiApiKey"] as string | undefined)?.trim()) ||
      (typeof process !== "undefined" &&
        process.env &&
        ((process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"])?.trim())),
    );

    return {
      success: true,
      hasServerQwenKey,
      hasServerGroqKey,
      hasServerCerebrasKey,
      hasServerOpenRouterKey,
      hasServerNvidiaKey,
      hasServerGeminiKey,
      defaultRole:
        (config?.["defaultRole"] as string | undefined) || "Software Engineer (Entry Level)",
      companyName: (config?.["companyName"] as string | undefined) || "the hiring company",
      defaultModelId: (config?.["defaultModelId"] as string | undefined) || "",
      databaseConnected: true,
    };
  } catch {
    const hasEnvQwen = Boolean(
      typeof process !== "undefined" &&
        process.env &&
        ((process.env["QWEN_API_KEY"] || process.env["DASHSCOPE_API_KEY"] || process.env["VITE_QWEN_API_KEY"])?.trim()),
    );
    const hasEnvGroq = Boolean(
      typeof process !== "undefined" &&
        process.env &&
        ((process.env["GROQ_API_KEY"] || process.env["VITE_GROQ_API_KEY"])?.trim()),
    );
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
      hasServerQwenKey: hasEnvQwen,
      hasServerGroqKey: hasEnvGroq,
      hasServerCerebrasKey: false,
      hasServerOpenRouterKey: false,
      hasServerNvidiaKey: hasEnvNvidia,
      hasServerGeminiKey: hasEnvGemini,
      defaultRole: "Software Engineer (Entry Level)",
      companyName: "the hiring company",
      defaultModelId: "",
      databaseConnected: false,
    };
  }
}

/** Test an API Key against provider */
export async function testApiKey(data: {
  provider: "qwen" | "groq" | "cerebras" | "openrouter" | "nvidia" | "gemini";
  apiKey?: string;
  passcode?: string;
}): Promise<{ success: boolean; message: string }> {
  let key = data.apiKey?.trim();
  if (!key || key === "trigger-database-vault-test" || isMasked(key)) {
    if (data.passcode && !checkAdminPassword(data.passcode)) {
      return { success: false, message: "Unauthorized: Invalid admin passcode." };
    }
    try {
      const db = await getDb();
      const col = db.collection("system_settings");
      const config = await col.findOne({ key: "global_config" });
      if (data.provider === "qwen") {
        key =
          (config?.["qwenApiKey"] as string | undefined)?.trim() ||
          (typeof process !== "undefined" &&
            process.env &&
            (process.env["QWEN_API_KEY"] || process.env["DASHSCOPE_API_KEY"] || process.env["VITE_QWEN_API_KEY"])) ||
          "";
      } else if (data.provider === "groq") {
        key =
          (config?.["groqApiKey"] as string | undefined)?.trim() ||
          (typeof process !== "undefined" &&
            process.env &&
            (process.env["GROQ_API_KEY"] || process.env["VITE_GROQ_API_KEY"])) ||
          "";
      } else if (data.provider === "cerebras") {
        key =
          (config?.["cerebrasApiKey"] as string | undefined)?.trim() ||
          (typeof process !== "undefined" &&
            process.env &&
            (process.env["CEREBRAS_API_KEY"] || process.env["VITE_CEREBRAS_API_KEY"])) ||
          "";
      } else if (data.provider === "openrouter") {
        key =
          (config?.["openrouterApiKey"] as string | undefined)?.trim() ||
          (typeof process !== "undefined" &&
            process.env &&
            (process.env["OPENROUTER_API_KEY"] || process.env["VITE_OPENROUTER_API_KEY"])) ||
          "";
      } else if (data.provider === "gemini") {
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
      message: `No API key configured in MongoDB Vault for ${data.provider.toUpperCase()}. Please add it in Admin Panel (/admin).`,
    };
  }

  if (data.provider === "qwen") {
    try {
      let res = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "qwen-plus",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok && (res.status === 401 || res.status === 403 || res.status === 404)) {
        res = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "qwen-plus",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(10000),
        });
      }

      if (res.ok) return { success: true, message: "Qwen / Alibaba DashScope API key is valid and working!" };
      const err = await res.text().catch(() => "");
      if (err.includes("AccessDenied.Unpurchased") || res.status === 403) {
        return {
          success: false,
          message:
            "Qwen key is authenticated, but your Alibaba account has not claimed free trial tokens yet. Please visit https://home.qwencloud.com/benefits to activate your 2,000,000 free tokens.",
        };
      }
      if (err.includes("Incorrect API key") || res.status === 401) {
        return {
          success: false,
          message: "Invalid Qwen API key. Please generate a new key from https://home.qwencloud.com/benefits.",
        };
      }
      return { success: false, message: `Qwen DashScope check failed (${res.status}): ${err.slice(0, 120)}` };
    } catch (e) {
      return { success: false, message: `Qwen connection failed: ${String(e)}` };
    }
  }

  if (data.provider === "groq") {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { success: true, message: "Groq Cloud API key is valid and working (100% Free · 500+ tok/s)!" };
      const err = await res.text().catch(() => "");
      return { success: false, message: `Groq check failed (${res.status}): ${err.slice(0, 120)}` };
    } catch (e) {
      return { success: false, message: `Groq connection failed: ${String(e)}` };
    }
  }

  if (data.provider === "cerebras") {
    try {
      const res = await fetch("https://api.cerebras.ai/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        return { success: true, message: "Cerebras Wafer-Scale API key is valid and working!" };
      }
      const err = await res.text().catch(() => "");
      if (res.status === 402) {
        return {
          success: false,
          message: "Cerebras key authenticated, but free trial credits are exhausted (HTTP 402).",
        };
      }
      return { success: false, message: `Cerebras check failed (${res.status}): ${err.slice(0, 120)}` };
    } catch (e) {
      return { success: false, message: `Cerebras connection failed: ${String(e)}` };
    }
  }

  if (data.provider === "openrouter") {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://resumeradiance.com",
          "X-Title": "Resume Radiance",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { success: true, message: "OpenRouter API key is valid and working!" };
      const err = await res.text().catch(() => "");
      return { success: false, message: `OpenRouter check failed (${res.status}): ${err.slice(0, 120)}` };
    } catch (e) {
      return { success: false, message: `OpenRouter connection failed: ${String(e)}` };
    }
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
      return { success: false, message: `Gemini API check failed (${res.status}): ${errText.slice(0, 120)}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, message: `Gemini connection failed: ${msg}` };
    }
  }

  // Default: NVIDIA NIM
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/diffusiongemma-26b-a4b-it",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      return { success: true, message: "NVIDIA NIM API key is valid and working (TensorRT Accelerated)!" };
    }
    const errText = await res.text().catch(() => "");
    return { success: false, message: `NVIDIA API check failed (${res.status}): ${errText.slice(0, 120)}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `NVIDIA connection failed: ${msg}` };
  }
}

/* ------------------------------- TanStack Server Function RPC Wrappers ------------------------------- */

export const saveAnalysisMongoFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      fileName: string;
      analysis: Analysis;
      cleanText?: string | undefined;
      rawText?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => saveAnalysisMongo(data));

export const loadAnalysesMongoFn = createServerFn({ method: "GET" }).handler(async () =>
  loadAnalysesMongo(),
);

export const deleteAnalysisMongoFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; passcode?: string }) => data)
  .handler(async ({ data }) => deleteAnalysisMongo(data));

export const deleteManyAnalysesMongoFn = createServerFn({ method: "POST" })
  .validator((data: { ids: string[]; passcode?: string }) => data)
  .handler(async ({ data }) => deleteManyAnalysesMongo(data));

export const clearAnalysesMongoFn = createServerFn({ method: "POST" })
  .validator((data: { adminPass?: string; passcode?: string }) => data)
  .handler(async ({ data }) => clearAnalysesMongo(data));

export const verifyAdminPassFn = createServerFn({ method: "POST" })
  .validator((data: { passcode: string }) => data)
  .handler(async ({ data }) => ({ valid: checkAdminPassword(data.passcode) }));

export const saveAdminSettingsFn = createServerFn({ method: "POST" })
  .validator((data: { passcode: string; settings: AdminSystemSettings }) => data)
  .handler(async ({ data }) => saveAdminSettings(data));

export const getAdminSettingsFn = createServerFn({ method: "POST" })
  .validator((data: { passcode: string }) => data)
  .handler(async ({ data }) => getAdminSettings(data));

export const testApiKeyFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      provider: "qwen" | "groq" | "cerebras" | "openrouter" | "nvidia" | "gemini";
      apiKey?: string;
      passcode?: string;
    }) => data,
  )
  .handler(async ({ data }) => testApiKey(data));

export const getPublicSystemInfoFn = createServerFn({ method: "GET" }).handler(async () =>
  getPublicSystemInfo(),
);
