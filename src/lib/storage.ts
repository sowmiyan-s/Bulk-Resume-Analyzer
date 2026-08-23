/**
 * Unified Result Storage (MongoDB Atlas Cloud + LocalStorage Fallback)
 *
 * Persists candidate analysis results to MongoDB Atlas cloud database (`analyses` collection)
 * via server functions, and keeps a synchronized browser localStorage copy for offline usage.
 */

import type { Analysis } from "./analysis-types";
import {
  saveAnalysisMongoFn,
  loadAnalysesMongoFn,
  clearAnalysesMongoFn,
  deleteAnalysisMongoFn,
  deleteManyAnalysesMongoFn,
} from "./database.server";

export type StoredAnalysis = {
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
  clean_text?: string;
  raw_text?: string;
  analysis: Analysis;
};

const LS_KEY = "resume-radiance.results.v1";

/* ----------------------------- localStorage ----------------------------- */

function readLocal(): StoredAnalysis[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) ?? "[]") as StoredAnalysis[];
  } catch {
    return [];
  }
}

function writeLocal(rows: StoredAnalysis[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-500)));
  } catch {
    /* quota — keep the most recent 500 */
  }
}

/* ------------------------------ public API ------------------------------ */

/**
 * Persist one analysis.
 * Saves to MongoDB Atlas in background and keeps localStorage updated.
 */
export async function saveAnalysis(input: {
  id: string;
  fileName: string;
  analysis: Analysis;
  cleanText?: string;
  rawText?: string;
}): Promise<StoredAnalysis> {
  const row: StoredAnalysis = {
    id: input.id,
    file_name: input.fileName,
    candidate_name: input.analysis.candidateName,
    role: input.analysis.role,
    overall_score: input.analysis.overallScore,
    readiness_tier: input.analysis.readinessTier,
    evaluation_basis: input.analysis.evaluationBasis,
    assumed_role: input.analysis.assumedRole,
    jd_score: input.analysis.jdScore,
    created_at: new Date().toISOString(),
    clean_text: input.cleanText || "",
    raw_text: input.rawText || "",
    analysis: input.analysis,
  };

  // Always update local cache first for zero-latency UI
  const all = readLocal();
  const next = all.filter((r) => r.id !== row.id).concat(row);
  writeLocal(next);

  // Persist to MongoDB Atlas cloud database via server function
  try {
    void saveAnalysisMongoFn({
      data: {
        id: input.id,
        fileName: input.fileName,
        analysis: input.analysis,
        cleanText: input.cleanText,
        rawText: input.rawText,
      },
    }).catch((err) => {
      console.warn("[storage] MongoDB save failed:", err);
    });
  } catch {
    /* ignore */
  }

  return row;
}

/** Load all stored analyses (MongoDB first, merged with local records). */
export async function loadAnalyses(): Promise<StoredAnalysis[]> {
  try {
    const res = await loadAnalysesMongoFn();
    if (res && res.success && Array.isArray(res.items) && res.items.length > 0) {
      // Merge with any local records
      const local = readLocal().filter((l) => !res.items.some((r) => r.id === l.id));
      const combined = [...(res.items as StoredAnalysis[]), ...local];
      writeLocal(combined);
      return combined;
    }
  } catch (e) {
    console.warn("[storage] MongoDB load failed, using local cache:", e);
  }

  return readLocal().slice().reverse();
}

/** Delete a single stored analysis by ID from both localStorage and MongoDB Atlas. */
export async function deleteStoredAnalysis(id: string): Promise<void> {
  const all = readLocal();
  const next = all.filter((r) => r.id !== id);
  writeLocal(next);

  try {
    void deleteAnalysisMongoFn({ data: { id } }).catch((err) => {
      console.warn("[storage] MongoDB delete failed:", err);
    });
  } catch {
    /* ignore */
  }
}

/** Delete multiple stored analyses by IDs from both localStorage and MongoDB Atlas. */
export async function deleteStoredAnalyses(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  const all = readLocal();
  const next = all.filter((r) => !idSet.has(r.id));
  writeLocal(next);

  try {
    void deleteManyAnalysesMongoFn({ data: { ids } }).catch((err) => {
      console.warn("[storage] MongoDB deleteMany failed:", err);
    });
  } catch {
    /* ignore */
  }
}

/** Clear all stored analyses from MongoDB and localStorage. */
export async function clearAnalyses(): Promise<void> {
  try {
    void clearAnalysesMongoFn({ data: {} }).catch(() => {});
  } catch {
    /* ignore */
  }
  writeLocal([]);
}
