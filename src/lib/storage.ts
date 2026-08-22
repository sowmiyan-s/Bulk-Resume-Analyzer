/**
 * Cloud-aware result storage.
 *
 * Persists candidate analysis results to Supabase cloud database (`analyses` table)
 * when configured (via Settings dialog or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars).
 * Automatically and gracefully falls back to browser localStorage if not configured or offline.
 */

import {
  ANALYSES_TABLE,
  RESUME_BUCKET,
  SUPABASE_ANON_KEY as ENV_ANON_KEY,
  SUPABASE_URL as ENV_URL,
} from "./appConfig";
import type { Analysis } from "./analysis-types";
import { loadSettings } from "./settings";

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

export function getActiveSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const settings = typeof window !== "undefined" ? loadSettings() : null;
  const url = (settings?.supabaseUrl?.trim() || ENV_URL || "").replace(/\/+$/, "");
  const anonKey = settings?.supabaseAnonKey?.trim() || ENV_ANON_KEY || "";
  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
}

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

/* ------------------------------- Supabase ------------------------------- */

type SbRow = Record<string, unknown>;

async function sbFetch(
  path: string,
  init: RequestInit = {},
  customConfig?: { url: string; anonKey: string },
): Promise<Response> {
  const config = customConfig || getActiveSupabaseConfig();
  if (!config.isConfigured && !customConfig?.url) {
    throw new Error("Supabase is not configured.");
  }
  return fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function sbUpsert(row: SbRow) {
  const res = await sbFetch(`${ANALYSES_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    // Fall back to plain insert
    const res2 = await sbFetch(ANALYSES_TABLE, {
      method: "POST",
      body: JSON.stringify([row]),
    });
    if (!res2.ok) {
      const detail = await res2.text().catch(() => "");
      throw new Error(`Supabase insert failed (${res2.status}): ${detail.slice(0, 200)}`);
    }
  }
}

/* ------------------------------ public API ------------------------------ */

/**
 * Test connectivity and verify if the `analyses` table exists in Supabase.
 */
export async function testSupabaseConnection(
  url?: string,
  anonKey?: string,
): Promise<{ ok: boolean; message: string; tableReady: boolean }> {
  const targetUrl = (url?.trim() || getActiveSupabaseConfig().url).replace(/\/+$/, "");
  const targetKey = anonKey?.trim() || getActiveSupabaseConfig().anonKey;

  if (!targetUrl || !targetKey) {
    return {
      ok: false,
      message: "Please enter both Supabase Project URL and Anon API Key.",
      tableReady: false,
    };
  }

  try {
    const res = await sbFetch(
      `${ANALYSES_TABLE}?select=id&limit=1`,
      { method: "GET" },
      { url: targetUrl, anonKey: targetKey, isConfigured: true },
    );

    if (res.ok) {
      return {
        ok: true,
        message: "Connected! Cloud table 'analyses' is active and ready.",
        tableReady: true,
      };
    }

    if (res.status === 404 || res.status === 400) {
      return {
        ok: true,
        message:
          "Connected to Supabase! However, the 'analyses' table is missing. Run the SQL schema to create it.",
        tableReady: false,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: "Authentication failed. Check your Supabase anon public API key.",
        tableReady: false,
      };
    }

    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      message: `Supabase returned status ${res.status}: ${detail.slice(0, 150)}`,
      tableReady: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Could not connect to ${targetUrl}: ${msg}`,
      tableReady: false,
    };
  }
}

/**
 * Persist one analysis. Returns the stored record.
 * Degrades gracefully to localStorage if Supabase is offline or fails.
 */
export async function saveAnalysis(input: {
  id: string;
  fileName: string;
  analysis: Analysis;
  resumeBytes?: Uint8Array;
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

  const config = getActiveSupabaseConfig();
  if (config.isConfigured) {
    try {
      await sbUpsert(row as unknown as SbRow);
      if (input.resumeBytes && input.resumeBytes.length) {
        await storeTempResume(input.id, input.resumeBytes).catch(() => {});
        await deleteTempResume(input.id).catch(() => {});
      }
      // Also update local copy
      const all = readLocal();
      const next = all.filter((r) => r.id !== row.id).concat(row);
      writeLocal(next);
      return row;
    } catch (e) {
      console.warn("[storage] Supabase save failed, falling back to localStorage:", e);
    }
  }

  const all = readLocal();
  const next = all.filter((r) => r.id !== row.id).concat(row);
  writeLocal(next);
  return row;
}

/** Load all stored analyses (cloud first, then merged with local records). */
export async function loadAnalyses(): Promise<StoredAnalysis[]> {
  const config = getActiveSupabaseConfig();
  if (config.isConfigured) {
    try {
      const res = await sbFetch(`${ANALYSES_TABLE}?select=*&order=created_at.desc&limit=1000`);
      if (res.ok) {
        const rows = (await res.json()) as StoredAnalysis[];
        const local = readLocal().filter((l) => !rows.some((r) => r.id === l.id));
        return [...rows, ...local];
      }
    } catch (e) {
      console.warn("[storage] Supabase load failed, using localStorage fallback:", e);
    }
  }
  return readLocal().slice().reverse();
}

export async function clearAnalyses(): Promise<void> {
  const config = getActiveSupabaseConfig();
  if (config.isConfigured) {
    try {
      await sbFetch(`${ANALYSES_TABLE}?id=neq.00000000-0000-0000-0000-000000000000`, {
        method: "DELETE",
      });
    } catch {
      /* ignore */
    }
  }
  writeLocal([]);
}

/* ---------------------- temporary resume storage ---------------------- */

async function storeTempResume(id: string, bytes: Uint8Array) {
  const config = getActiveSupabaseConfig();
  if (!config.isConfigured) return;
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" }),
    `${id}.bin`,
  );
  await fetch(`${config.url}/storage/v1/object/${RESUME_BUCKET}/${id}.bin`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: form,
  });
}

async function deleteTempResume(id: string) {
  const config = getActiveSupabaseConfig();
  if (!config.isConfigured) return;
  await fetch(`${config.url}/storage/v1/object/${RESUME_BUCKET}/${id}.bin`, {
    method: "DELETE",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });
}
