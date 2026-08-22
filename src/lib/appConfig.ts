/**
 * App-level configuration. Everything here is OPTIONAL — the app works fully
 * offline and stores results in the browser. Supabase is used only if the two
 * env vars below are provided (e.g. via a `.env` / Vite env). When absent,
 * `storage.ts` transparently falls back to localStorage.
 *
 * To enable cloud storage, set in `.env` (or your deploy environment):
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ...
 * and (optionally) pre-create the `analyses` table, or let the first save
 * attempt fail silently and keep using localStorage.
 */

const env =
  (typeof import.meta !== "undefined" && import.meta.env) ||
  ({} as Record<string, string | undefined>);

export const SUPABASE_URL: string = (env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
export const SUPABASE_ANON_KEY: string =
  (env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";

/** Table that stores analysis results (one row per resume). */
export const ANALYSES_TABLE = "analyses";
/** Bucket used for temporary resume storage. Files are deleted after analysis. */
export const RESUME_BUCKET = "resumes-temp";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Global defaults for the "no JD" case. These are the honest fallback the model
 * uses when the recruiter hasn't pasted a job description, so bulk screening is
 * always anchored to a concrete, real role rather than vague "general standards".
 */
export const DEFAULT_ROLE = "Software Engineer (Entry Level)";
export const DEFAULT_COMPANY = "the hiring company";
