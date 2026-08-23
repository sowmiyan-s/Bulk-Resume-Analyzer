/**
 * Browser-side LLM client. No backend of ours: the fetch happens in the tab,
 * optionally through a Supabase Edge Function proxy for providers (NVIDIA) that
 * don't send CORS headers.
 *
 * Token discipline (your requirement — "don't consume high tokens"):
 *   - Resume text capped by capForPrompt() before it ever gets here.
 *   - The prompt names the JSON keys once, compactly, with no example payload.
 *   - max_tokens is bounded and we ask for terse arrays (caps per field).
 *   - No full-resume rewrite; we return targeted bullet rewrites instead, which
 *     is both more useful to a student and ~4x cheaper in output tokens.
 *
 * Honesty discipline (v2):
 *   - The model must ONLY reference things that appear in the resume. No invented
 *     praise, no made-up metrics, no generic filler ("great potential", "strong
 *     candidate"). Every critical issue must quote the resume verbatim.
 *   - When no job description is given we evaluate against a default/assumed role
 *     (the recruiter picks one in Settings) and say so explicitly.
 *   - When a JD IS given we act as that company's hiring manager: blunt about fit.
 */

import { NVIDIA_BASE, GEMINI_BASE, findModel, type ModelOption } from "./models";
import { capForPrompt } from "./sanitize";
import { executeLlmProxy } from "./llm-proxy.server";

export type LlmSettings = {
  modelId: string;
  /** API key for the selected provider. Kept in localStorage, never sent anywhere but the provider. */
  apiKey: string;
  /** Optional Supabase Edge Function URL that forwards to the provider. */
  proxyUrl: string;
  /** Base URL override for the openai-compatible provider. */
  customBaseUrl: string;
  temperature: number;
  maxTokens: number;
  /** Default job role used when no job description is supplied. */
  defaultRole: string;
  /** Hiring company name, used in the framing when a JD is supplied. */
  companyName: string;
  /** Optional Supabase Cloud database project URL */
  supabaseUrl?: string;
  /** Optional Supabase Anonymous API key */
  supabaseAnonKey?: string;
};

export const DEFAULT_SETTINGS: LlmSettings = {
  modelId: "meta/llama-3.3-70b-instruct",
  apiKey: "",
  proxyUrl: "",
  customBaseUrl: "",
  temperature: 0.2,
  maxTokens: 2000,
  defaultRole: "Software Engineer (Entry Level)",
  companyName: "the hiring company",
  supabaseUrl: "",
  supabaseAnonKey: "",
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/* ------------------------------- prompting ------------------------------- */

const SYSTEM_PROMPT =
  "You are a perceptive, experienced technical hiring manager and placement dean. " +
  "Evaluate each candidate based on genuine engineering competence, technical depth, and practical problem solving. " +
  "Do not rely on cookie-cutter AI assumptions. Differentiate clearly between exceptional builders, capable students, and weak profiles based on real project substance. " +
  "Be concise, direct, and quote exact substrings from the resume. " +
  "Reply with one compact, raw JSON object only: no markdown formatting, no commentary.";

/** Compact key list. Deliberately no sample JSON — that alone saves ~400 input tokens. */
const SCHEMA_SPEC = `Keys (all required, all strings/arrays/objects as typed):
candidate_name:string (from resume, else "Unnamed candidate")
role:string (the target role you infer from the resume)
assumed_role:string (the role you evaluated against — equals role when no JD was given, else the JD role)
evaluation_basis:string ("role-fit" when judged against a default role, "jd-fit" when a JD was supplied)
overall_score:int 0-100 (real campus shortlisting odds; differentiate strictly from 30 to 95)
readiness_tier:"Tier 1: Shortlist Ready"|"Tier 2: Needs Minor Polish"|"Tier 3: Overhaul Required"
score_breakdown:[{category:"Technical Depth & Stack"|"Project Scope & Problem Solving"|"Practical Impact & Experience"|"Structure & ATS Parseability"|"Language & Polish",score:int,max:int,note:string}] exactly 5 rows with maxes: 25, 25, 20, 15, 15 (sum to 100)
recruiter_first_impression:string (<=35 words: blunt 6-second scan reaction)
hr_verdict:string (<=45 words: clear shortlist or reject reasons)
strengths:[string] max 3 (concrete verified technical capabilities)
critical_issues:[{severity:"critical"|"major"|"minor",area,problem,evidence,fix}] 3-5 items, evidence must quote the resume verbatim
grammar_and_ocr_errors:[string] max 5, format "wrong -> correct"
formatting_problems:[string] max 3 (ATS parseability)
skill_matrix:{matched_skills:[string],missing_skills:[string],recommended_skills:[string] max 5 each}
bullet_rewrites:[{original,rewritten,reason}] 3 items. Rewritten bullets must be clear, human, and impactful (Action Verb + Tech / Architecture + Outcome). Include numbers ONLY when genuine or realistic; NEVER insert fake placeholders like "[X]%".
tech_improvement_ideas:[string] max 4 (concrete tools/tech to master)
project_suggestions:[string] max 2 (concrete fixes for biggest skill gaps)
structure:{score:int 0-100,label:string ("Excellent"|"Good"|"Needs work"|"Poor"),notes:[string] max 3}
data_gaps:[{area,missing,impact}] max 4 (missing links, tech details, etc.)
relevance:{assumed_role:string, evaluation_basis:string, skills_misaligned:boolean, verdict:string <=35 words}`;

const RULES = `Scoring Rubric & Genuine Assessment:
- Differentiate sharply based on technical substance! Avoid clustered middle scores (e.g. 70-75).
- Tier 1 (85-100): Exceptional candidate. Shows deep technical competence, non-trivial projects (fullstack, distributed systems, algorithms, APIs, dev tools), genuine architecture depth, clean formatting.
- Tier 2 (60-84): Average to solid candidate. Good fundamentals and working projects, but bullets may be passive, tech stack is basic academic coursework, or minor ATS flaws exist.
- Tier 3 (30-59): High risk. Superficial buzzword lists with no demonstrable project backing, missing core CS skills, or major format/OCR flaws.
- DO NOT force artificial metrics or fake percentages onto every project. Technical depth, architectural complexity, and problem solving are what truly matter. Quantify metrics ONLY when naturally relevant.
- score_breakdown must use maxes [25, 25, 20, 15, 15] for the 5 categories.
- evidence must be an exact verbatim quote from the resume.

Actionable Quality Guidelines (NO GENERIC FILLER):
- NEVER output generic placeholder text like "wrong -> correct", "None", "no error", "Some formatting issues", or "Develop a full-stack web application".
- grammar_and_ocr_errors: ONLY real typos/OCR mistakes found in text (format: "typo -> correct"). If none found, return [].
- formatting_problems: Concrete ATS issues (e.g. "Two-column table format fails standard ATS parsers", "Missing explicit date ranges on experience"). If none, return [].
- tech_improvement_ideas: High-impact specific tools/concepts (e.g. "PostgreSQL with query indexing & migrations", "Docker containerization & GitHub Actions CI/CD", "Redis for in-memory caching").
- project_suggestions: Specific architectural blueprints that fix their specific gaps (e.g. "Build a distributed rate-limited API gateway with JWT auth, Redis, and unit tests").
- strengths: Genuine, verified capabilities found on the resume (e.g. "Architected multi-agent FastAPI backend", "Published NPM package with 100+ downloads").
- Keep all strings tight, terse, and student-improving.`;

export function buildMessages(input: {
  fileName: string;
  resumeText: string;
  jobDescription?: string;
  defaultRole?: string;
  companyName?: string;
}): Array<{ role: "system" | "user"; content: string }> {
  const jd = input.jobDescription?.trim();
  const defaultRole = input.defaultRole?.trim() || "Software Engineer (Entry Level)";
  const company = input.companyName?.trim() || "the hiring company";

  const jdBlock = jd
    ? `TARGET JOB DESCRIPTION (you are acting as the hiring manager for ${company}):
${capForPrompt(jd, 2200)}

You MUST judge this resume strictly as a candidate for THAT role at ${company}. Be blunt about fit.
Also add: jd_score:int 0-100 (fit against this JD) and jd_verdict:string (<=35 words, why they would or would not get an interview). Compute skill_matrix strictly against this JD. Set relevance.evaluation_basis to "jd-fit".`
    : `NO job description was supplied. Evaluate this resume against the DEFAULT role below and judge campus-placement readiness for that kind of role.
DEFAULT ROLE: ${defaultRole}
Set evaluation_basis to "role-fit". Set assumed_role to the role you are judging against (use "${defaultRole}" unless the resume clearly targets a different one). In relevance.verdict, say plainly whether the resume's actual skills and projects line up with that role, and flag it if the skills listed look unrelated to the experience shown.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Audit this resume (file: ${input.fileName}).
${jdBlock}

RESUME:
${capForPrompt(input.resumeText)}

${SCHEMA_SPEC}

${RULES}`,
    },
  ];
}

/* ------------------------------ JSON recovery ----------------------------- */

/** Pulls a JSON object out of model output, tolerating fences, prose and <think>. */
export function extractJson(raw: string): unknown {
  let text = (raw ?? "").trim();
  if (!text) throw new LlmError("Model returned an empty response.", null, true);

  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();

  const start = text.indexOf("{");
  if (start === -1) throw new LlmError("Model did not return JSON.", null, true);

  // Brace-match so trailing prose after the object doesn't break the parse.
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      end = i;
      break;
    }
  }

  const slice = text.slice(start, end === -1 ? text.length : end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // Last-ditch repairs: trailing commas, and an object truncated by max_tokens.
    const repaired = slice.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {
      const salvaged = repaired.replace(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/, "");
      const closes = (salvaged.match(/\{/g)?.length ?? 0) - (salvaged.match(/\}/g)?.length ?? 0);
      try {
        return JSON.parse(salvaged + "]".repeat(0) + "}".repeat(Math.max(0, closes)));
      } catch {
        throw new LlmError(
          "Could not parse the model's JSON (likely truncated — raise Max tokens).",
          null,
          true,
        );
      }
    }
  }
}

/* ------------------------------- transport ------------------------------- */

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const j = JSON.parse(body);
    return String(j?.error?.message ?? j?.message ?? j?.detail ?? body).slice(0, 300);
  } catch {
    return body.slice(0, 300) || res.statusText;
  }
}

function endpointFor(model: ModelOption, s: LlmSettings): string {
  if (s.proxyUrl.trim()) return s.proxyUrl.trim();
  if (model.provider === "gemini") {
    return `${GEMINI_BASE}/${model.id}:generateContent`;
  }
  if (model.provider === "openai-compatible") {
    const base = s.customBaseUrl.trim();
    if (!base) throw new LlmError("Set a base URL for the custom model in Settings.", null, false);
    return base.endsWith("/chat/completions")
      ? base
      : base.replace(/\/+$/, "") + "/chat/completions";
  }
  return NVIDIA_BASE;
}

/** One attempt. Retries are handled by the queue so it can show live status. */
export async function callModel(
  input: {
    fileName: string;
    resumeText: string;
    jobDescription?: string;
    defaultRole?: string;
    companyName?: string;
  },
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<unknown> {
  const model = findModel(settings.modelId);
  const messages = buildMessages(input);
  const customProxyUrl = settings.proxyUrl.trim();

  let json: Record<string, unknown>;

  // 1. If user explicitly provided a custom external proxy URL:
  if (customProxyUrl) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim() || "sk-litellm"}`,
    };
    const isDeepSeek = model.id.toLowerCase().includes("deepseek");
    const body = {
      provider: model.provider,
      model: model.id === "custom" ? (settings.customBaseUrl ? "custom" : model.id) : model.id,
      messages,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      stream: false,
      ...(model.supportsJsonMode && !isDeepSeek
        ? { response_format: { type: "json_object" } }
        : {}),
      ...(isDeepSeek ? { chat_template_kwargs: { thinking: false } } : {}),
    };

    try {
      const res = await fetch(customProxyUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });

      if (!res.ok) {
        const detail = await readError(res);
        const retryable = RETRYABLE_STATUS.has(res.status);
        throw new LlmError(`Custom proxy failed (${res.status}): ${detail}`, res.status, retryable);
      }

      json = (await res.json()) as Record<string, unknown>;
    } catch (e: unknown) {
      if (e instanceof LlmError) throw e;
      if (signal?.aborted) throw new LlmError("Cancelled.", null, false);
      const msg = e instanceof Error ? e.message : String(e);
      throw new LlmError(`Custom proxy request failed: ${msg}`, null, true);
    }
  } else {
    // 2. Built-in server proxy (NVIDIA NIM, Gemini, LiteLLM & OpenAI-compatible with MongoDB Atlas Vault fallback)
    try {
      json = (await executeLlmProxy({
        data: {
          provider: model.provider,
          modelId: model.id,
          apiKey: settings.apiKey.trim(),
          customBaseUrl: settings.customBaseUrl?.trim(),
          messages,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          supportsJsonMode: model.supportsJsonMode,
        },
      })) as Record<string, unknown>;
    } catch (e: unknown) {
      if (e instanceof LlmError) throw e;
      if (signal?.aborted) throw new LlmError("Cancelled.", null, false);
      const errMsg = e instanceof Error ? e.message : String(e);
      const isAuth =
        errMsg.includes("401") ||
        errMsg.includes("403") ||
        errMsg.toLowerCase().includes("unauthorized") ||
        errMsg.toLowerCase().includes("invalid api key") ||
        errMsg.toLowerCase().includes("no api key");
      const isRate =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("rate limit") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("resource_exhausted") ||
        errMsg.toLowerCase().includes("too many requests");

      const providerLabel =
        model.provider === "nvidia"
          ? "NVIDIA NIM"
          : model.provider === "gemini"
            ? "Google Gemini"
            : model.provider === "litellm"
              ? "LiteLLM"
              : "API";

      throw new LlmError(
        errMsg.includes("No API key")
          ? errMsg
          : isRate
            ? `${providerLabel} rate limit reached (HTTP 429). The system is automatically cooling down and retrying.`
            : `${providerLabel} request failed: ${errMsg}${
                isAuth && model.provider === "nvidia"
                  ? " (Make sure your NVIDIA API key starts with nvapi-)"
                  : ""
              }`,
        isAuth ? 401 : isRate ? 429 : 500,
        !isAuth,
      );
    }
  }

  const text = extractContent(json);
  return extractJson(text);
}

/** Handles OpenAI-shaped, NVIDIA NIM reasoning, Gemini-shaped and proxy-passthrough responses. */
function extractContent(json: Record<string, unknown>): string {
  const choices = json["choices"] as Array<Record<string, unknown>> | undefined;
  if (choices?.length) {
    const msg = choices[0]!["message"] as Record<string, unknown> | undefined;
    const content = msg?.["content"];
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      return content.map((p) => (p as Record<string, unknown>)?.["text"] ?? "").join("");
    }
    // NVIDIA NIM reasoning models (DeepSeek, Nemotron)
    const reasoning = msg?.["reasoning_content"] || msg?.["reasoning"];
    if (typeof reasoning === "string" && reasoning.trim()) return reasoning;

    const textField = choices[0]!["text"];
    if (typeof textField === "string" && textField.trim()) return textField;
  }

  const candidates = json["candidates"] as Array<Record<string, unknown>> | undefined;
  if (candidates?.length) {
    const first = candidates[0]!;
    const finish = String(first["finishReason"] ?? "");
    const parts = (first["content"] as Record<string, unknown> | undefined)?.["parts"] as
      Array<Record<string, unknown>> | undefined;
    const text = (parts ?? []).map((p) => String(p["text"] ?? "")).join("");
    if (text.trim()) return text;
    if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
      throw new LlmError("Gemini blocked this resume on safety filters.", null, false);
    }
    if (finish === "MAX_TOKENS") {
      throw new LlmError(
        "Response hit the token ceiling. Raise Max tokens in Settings.",
        null,
        true,
      );
    }
  }

  const blocked = (json["promptFeedback"] as Record<string, unknown> | undefined)?.["blockReason"];
  if (blocked) throw new LlmError(`Provider blocked the request: ${String(blocked)}`, null, false);

  throw new LlmError("Could not find generated text in the provider response.", null, true);
}
