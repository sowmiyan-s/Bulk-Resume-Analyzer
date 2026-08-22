/**
 * Unified Result Storage (MongoDB Atlas Cloud + LocalStorage Fallback)
 *
 * Persists candidate analysis results to MongoDB Atlas cloud database (`analyses` collection)
 * via server functions, and keeps a synchronized browser localStorage copy for offline usage.
 */

import type { Analysis } from "./analysis-types";
import { saveAnalysisMongoFn, loadAnalysesMongoFn, clearAnalysesMongoFn } from "./database.server";

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
      const combined = [...res.items, ...local];
      writeLocal(combined);
      return combined;
    }
  } catch (e) {
    console.warn("[storage] MongoDB load failed, using local cache:", e);
  }

  return readLocal().slice().reverse();
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
