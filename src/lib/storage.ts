/**
 * Unified Result Storage (MongoDB Atlas Cloud + LocalStorage Fallback)
 *
 * Persists candidate analysis results to MongoDB Atlas cloud database (`analyses` collection)
 * via server functions, and keeps a synchronized browser localStorage copy for offline usage.
 */

import type { Analysis } from "./analysis-types";

// Lazily load the TanStack server functions so the MongoDB driver — which extends
// Node's `events.EventEmitter` — is NEVER pulled into the client/browser bundle.
// A STATIC `import { ... } from "./database.server"` here dragged `mongodb` into the
// client graph, and because `events` is externalized to `undefined` in the browser,
// the driver's `class X extends EventEmitter` threw:
//   "Class extends value undefined is not a constructor or null"
// Dynamic import keeps the server-only module out of the client optimizer's reach;
// the server fns are still callable from the client (TanStack invokes them via RPC).
async function loadDbFns() {
  return import("./database.server");
}

let _dbFns: Awaited<ReturnType<typeof loadDbFns>> | null = null;
async function dbFns() {
  if (!_dbFns) _dbFns = await loadDbFns();
  return _dbFns;
}

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
  /** "in_flight" = analysis started but not yet completed (realtime checkpoint). */
  status?: "done" | "in_flight" | "error";
  created_at: string;
  updated_at?: string;
  clean_text?: string;
  raw_text?: string;
  analysis: Analysis | null;
};

const LS_KEY = "resume-radiance.results.v1";

let memoryCache: StoredAnalysis[] | null = null;

function readLocal(): StoredAnalysis[] {
  if (memoryCache !== null) return memoryCache;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    memoryCache = raw ? (JSON.parse(raw) as StoredAnalysis[]) : [];
    return memoryCache;
  } catch {
    memoryCache = [];
    return [];
  }
}

function writeLocal(rows: StoredAnalysis[]) {
  memoryCache = rows;
  if (typeof window === "undefined") return;
  try {
    // 1. First attempt: persist full records with complete text (modern browser quota is 5-10MB)
    window.localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-100)));
  } catch {
    try {
      // 2. Fallback on quota limit: keep full clean_text for last 50, compact older raw_text
      const semiCompact = rows.slice(-60).map((r, idx) => ({
        ...r,
        raw_text: idx >= 30 ? (r.raw_text ? r.raw_text.slice(0, 2000) : "") : "",
        clean_text: r.clean_text || "",
      }));
      window.localStorage.setItem(LS_KEY, JSON.stringify(semiCompact));
    } catch {
      try {
        // 3. High-density fallback: keep clean_text only
        const compact = rows.slice(-40).map((r) => ({
          ...r,
          raw_text: "",
          clean_text: r.clean_text || "",
        }));
        window.localStorage.setItem(LS_KEY, JSON.stringify(compact));
      } catch {
        /* final quota fallback */
      }
    }
  }
}

/* ------------------------------ public API ------------------------------ */

/**
 * Persist one analysis.
 * Saves to MongoDB Atlas cloud database and keeps localStorage updated.
 */
export async function saveAnalysis(input: {
  id: string;
  fileName: string;
  analysis: Analysis;
  cleanText?: string | undefined;
  rawText?: string | undefined;
}): Promise<StoredAnalysis> {
  /* ---- realtime, per-result persistence ---- */

  const row = toRow(input, "done" as const);

  // 1. Always update local cache first for zero-latency UI (deduplicating by file_name and id)
  const all = readLocal();
  const fileKey = (row.file_name || "").trim().toLowerCase();
  const next = all
    .filter((r) => r.id !== row.id && (!fileKey || (r.file_name || "").trim().toLowerCase() !== fileKey))
    .concat(row);
  writeLocal(next);

  // 2. Persist to MongoDB Atlas cloud database via server function.
  //    saveAnalysisMongoFn is an upsert, so calling it per-result (not in a
  //    single end-of-batch dump) streams each candidate into the cloud the
  //    instant it finishes.
  try {
    const { saveAnalysisMongoFn } = await dbFns();
    const res = await saveAnalysisMongoFn({
      data: {
        id: input.id,
        fileName: input.fileName,
        analysis: input.analysis,
        cleanText: input.cleanText,
        rawText: input.rawText,
      },
    });
    if (!res.success) {
      console.warn("[storage] MongoDB Atlas save reported issue:", res.error);
    }
  } catch (err) {
    console.warn("[storage] MongoDB Atlas save network call failed:", err);
  }

  return row;
}

function toRow(
  input: {
    id: string;
    fileName: string;
    analysis: Analysis;
    cleanText?: string | undefined;
    rawText?: string | undefined;
  },
  status: StoredAnalysis["status"],
): StoredAnalysis {
  return {
    id: input.id,
    file_name: input.fileName,
    candidate_name: input.analysis.candidateName || "Unnamed candidate",
    role: input.analysis.role || "—",
    overall_score: input.analysis.overallScore || 0,
    readiness_tier: input.analysis.readinessTier || "Tier 3: Overhaul Required",
    evaluation_basis: input.analysis.evaluationBasis || "role-fit",
    assumed_role: input.analysis.assumedRole || "",
    jd_score: input.analysis.jdScore ?? null,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    clean_text: input.cleanText || "",
    raw_text: input.rawText || "",
    analysis: input.analysis,
  };
}

/**
 * Realtime checkpoint: writes a lightweight "in-flight" record to the cloud the
 * instant analysis STARTS (before the model has even responded). This means a
 * 300-resume batch is streamed into MongoDB Atlas one candidate at a time as
 * work begins — not dumped at the very end. If the tab crashes or is closed
 * mid-batch, the in-flight record survives and is auto-resumed on the next load.
 */
export async function markAnalysisInFlight(input: {
  id: string;
  fileName: string;
  cleanText?: string;
  rawText?: string;
}): Promise<void> {
  const row: StoredAnalysis = {
    id: input.id,
    file_name: input.fileName,
    candidate_name: "Analyzing…",
    role: "—",
    overall_score: 0,
    readiness_tier: "Tier 3: Overhaul Required",
    evaluation_basis: "role-fit",
    assumed_role: "",
    jd_score: null,
    status: "in_flight" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    clean_text: input.cleanText || "",
    raw_text: input.rawText || "",
    analysis: null as unknown as Analysis,
  };

  // Local cache update for instant UI
  const all = readLocal();
  const fileKey = (row.file_name || "").trim().toLowerCase();
  const next = all
    .filter((r) => r.id !== row.id && (!fileKey || (r.file_name || "").trim().toLowerCase() !== fileKey))
    .concat(row);
  writeLocal(next);
}

/** Helper to strictly deduplicate an array of stored records by file_name */
function deduplicateStoredList(list: StoredAnalysis[]): StoredAnalysis[] {
  const map = new Map<string, StoredAnalysis>();
  for (const item of list) {
    const key = (item.file_name || item.id || "").trim().toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
    } else {
      const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const itemTime = new Date(item.updated_at || item.created_at || 0).getTime();
      if (itemTime >= existingTime || (item.analysis && !existing.analysis)) {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}

/** Returns ids of candidates left in `in_flight` by a crashed/abandoned batch. */
export function getInFlightIds(rows: StoredAnalysis[] = readLocal()): string[] {
  return rows.filter((r) => r.status === "in_flight").map((r) => r.id);
}

/** Load all stored analyses (MongoDB first, merged with local records). */
export async function loadAnalyses(): Promise<StoredAnalysis[]> {
  try {
    const { loadAnalysesMongoFn, saveAnalysisMongoFn } = await dbFns();
    const res = await loadAnalysesMongoFn();
    if (res && res.success && Array.isArray(res.items)) {
      if (res.items.length > 0) {
        // Merge with any local records and deduplicate strictly by file_name
        const local = readLocal();
        const combined = deduplicateStoredList([...(res.items as StoredAnalysis[]), ...local]);
        writeLocal(combined);

        // In background, sync any local-only records up to MongoDB Atlas
        if (local.length > 0) {
          for (const item of local) {
            if (item.analysis) {
              void saveAnalysisMongoFn({
                data: {
                  id: item.id,
                  fileName: item.file_name,
                  analysis: item.analysis,
                  cleanText: item.clean_text,
                  rawText: item.raw_text,
                },
              }).catch(() => {});
            }
          }
        }

        return combined;
      } else {
        // MongoDB collection is currently empty; sync local cache to MongoDB
        const local = deduplicateStoredList(readLocal());
        if (local.length > 0) {
          for (const item of local) {
            if (item.analysis) {
              void saveAnalysisMongoFn({
                data: {
                  id: item.id,
                  fileName: item.file_name,
                  analysis: item.analysis,
                  cleanText: item.clean_text,
                  rawText: item.raw_text,
                },
              }).catch(() => {});
            }
          }
        }
        return local;
      }
    }
  } catch (e) {
    console.warn("[storage] MongoDB load failed, using local cache:", e);
  }

  return deduplicateStoredList(readLocal()).reverse();
}

/** Delete a single stored analysis by ID from both localStorage and MongoDB Atlas. */
export async function deleteStoredAnalysis(id: string): Promise<void> {
  const all = readLocal();
  const next = all.filter((r) => r.id !== id);
  writeLocal(next);

  try {
    const { deleteAnalysisMongoFn } = await dbFns();
    await deleteAnalysisMongoFn({ data: { id } });
  } catch (err) {
    console.warn("[storage] MongoDB delete failed:", err);
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
    const { deleteManyAnalysesMongoFn } = await dbFns();
    await deleteManyAnalysesMongoFn({ data: { ids } });
  } catch (err) {
    console.warn("[storage] MongoDB deleteMany failed:", err);
  }
}

/** Clear all stored analyses from MongoDB and localStorage. */
export async function clearAnalyses(): Promise<void> {
  writeLocal([]);
  try {
    const { clearAnalysesMongoFn } = await dbFns();
    await clearAnalysesMongoFn({ data: {} });
  } catch (err) {
    console.warn("[storage] MongoDB clear failed:", err);
  }
}
