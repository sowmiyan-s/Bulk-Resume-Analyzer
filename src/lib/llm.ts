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

import { NVIDIA_BASE, GEMINI_BASE, findModel, DEFAULT_MODEL_ID, type ModelOption } from "./models";
import { capForPrompt } from "./sanitize";
import { executeLlmProxy } from "./llm-proxy.server";
import { classifyRoleArc, detectAiTools } from "./role-taxonomy";

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
  modelId: DEFAULT_MODEL_ID,
  apiKey: "",
  proxyUrl: "",
  customBaseUrl: "",
  temperature: 0.2,
  maxTokens: 2500,
  defaultRole: "Software Engineer (Entry Level)",
  companyName: "the hiring company",
  supabaseUrl: "",
  supabaseAnonKey: "",
};

export class LlmError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = "LlmError";
    this.status = status;
    this.retryable = retryable;
    Object.setPrototypeOf(this, LlmError.prototype);
  }
}

/* ------------------------------- prompting ------------------------------- */

const SYSTEM_PROMPT =
  "You are a Senior Technical Hiring Manager and Principal Engineering Assessor. " +
  "PRIMARY MISSION: Determine if the candidate is the BEST FIT for the Job Description (JD) / Target Role. " +
  "If the candidate is not yet an optimal fit, provide high-impact, actionable, and concrete suggestions on how to elevate their resume to become job-ready for this specific role. " +
  "MANDATORY EVALUATION PILLARS: " +
  "1. Skill Matching with JD: Check how well candidate core skills match JD requirements. Identify matched competencies, missing critical skills, and suggested bridge skills. " +
  "2. Technical Projects: Candidates must have at least 2 well-explained technical projects with architecture, tools used, and demonstrable outcomes. " +
  "3. Experience & Internships: Must have clear date ranges and meaningful explanations of responsibilities and technical impact. " +
  "4. Professional Summary: Must be tailored, scannable, and directly relevant to the target role/JD. " +
  "5. Contact Channels: Machine-readable email, phone number, LinkedIn profile, and verifiable GitHub/portfolio link. " +
  "6. Grammar & Spelling Hygiene: Catch genuine spelling mistakes and typos without being excessively punitive on overall score. " +
  "OPTIONAL SECTIONS PHILOSOPHY: " +
  "Sections like Education, Certifications, Achievements, and Extracurriculars are strictly OPTIONAL based on candidate preference. NEVER penalize a candidate or deduct points if education, certifications, or achievements are absent. Never demand credential IDs or license links for certifications. If certifications are present, suggest how to make them directly relevant to the target JD and project work. " +
  "CRITICAL RULE ON PROJECTS: NEVER SUGGEST RENAMING CANDIDATE PROJECTS. Keep the candidate's existing project names as they are. You cannot know the full context of their project from a short resume snippet. Only suggest content improvements (such as adding metrics, architecture details, or stack clarification), never alternative project titles. " +
  "ZERO-HALLUCINATION DISCIPLINE: Anchor all evaluations strictly in the actual text of the resume. Never hallucinate project renames, nonexistent credentials, or fabricated numbers. " +
  "The deterministic ATS score and JD match in the user prompt are authoritative. Return ONE compact, raw JSON object matching the schema specification without markdown fences or extraneous commentary.";

/** Compact key list for authentic engineering talent analysis without filler. */
const SCHEMA_SPEC = `Keys (all required, all strings/arrays/objects as typed):
candidate_name:string (Extract candidate's actual name from resume header or file name without honorifics like Mr/Ms)
role:string (target role inferred or specified)
assumed_role:string (role evaluated against)
evaluation_basis:string ("role-fit" when judged against a default role, "jd-fit" when a JD was supplied)
overall_score:int 0-100 (echo the authoritative real_ats_score from ATS PRE-COMPUTED FACTS; never invent or override it)
readiness_tier:"Tier 1: Shortlist Ready"|"Tier 2: Needs Minor Polish"|"Tier 3: Overhaul Required"
score_breakdown:[{category:"Contact Details & Links"|"Skills & JD Matching"|"Projects Depth (>= 2 Projects)"|"Experience with Dates"|"Summary & Spelling Hygiene"|"Verified Certifications & Accreditations",score:int,max:int,note:string}] exactly 6 rows (maxes: 20, 30, 25, 15, 10, 0 or summing to 100)
jd_match:{score:int 0-100,verdict:string} (echo authoritative jd_keyword_match when supplied; never invent or override it)
recruiter_first_impression:string (<=35 words: blunt, authentic assessment of candidate's JD fit and project depth)
hr_verdict:string (<=45 words: clear hiring recommendation and gap-bridging verdict)
strengths:[string] max 3 (top concrete technical strengths, e.g. 'Built microservices with FastAPI & Redis', 'Solid full-stack Next.js + PostgreSQL integration')
critical_issues:[{severity:"critical"|"major"|"minor",area,problem,evidence,fix}] Flag genuine dealbreakers (missing contact email/phone, fewer than 2 projects, or 0% match with required tech stack). Return [] if the candidate has a functional technical profile.
grammar_and_ocr_errors:[string] Informational only: genuine misspelled words (e.g. '"algoritm" -> "algorithm"'). Return [] if clean.
formatting_problems:[string] Informational only: missing contact info or unreadable blocks. Return [] if clean.
skill_matrix:{matched_skills:[string],missing_skills:[string],recommended_skills:[string] max 5 each} (Verified technical keywords)
bullet_rewrites:[{original,rewritten,reason}] 2-3 items. Elevate bullet points with concrete technical tools, architecture, and realistic developer metrics.
tech_improvement_ideas:[string] max 4 (concrete tools/frameworks that would elevate their technical stack to match the JD)
project_suggestions:[string] max 2 (advanced engineering project ideas to make them an immediate fit for the target JD - NEVER suggest renaming existing projects)
structure:{score:int 0-100,label:string ("Excellent"|"Good"|"Needs work"|"Poor"),notes:[string] max 3}
data_gaps:[{area,missing,impact}] max 3 (missing GitHub/live demo links, missing stack details)
relevance:{assumed_role:string, evaluation_basis:string, skills_misaligned:boolean, verdict:string <=35 words}
section_audits:{summary:{score:int 0-10,audit:string,fix_tip:string},skills:{score:int 0-30,matched_keywords:[string],missing_critical_skills:[string],audit:string,fix_tip:string},projects:{score:int 0-35,architecture_rating:string,live_proof:bool,audit:string,fix_tip:string},internships:{score:int 0-20,jd_relevance_pct:int 0-100,jd_relevance_explanation:string,audit:string,fix_tip:string},certifications:{score:int 0-5,verified_count:int,audit:string,fix_tip:string},achievements:{score:int 0-10,audit:string,fix_tip:string}}
section_improvements:[{section:string,current_gap:string,actionable_fix:string}] 3-5 concrete suggestions to make the resume job-fit (do NOT suggest renaming projects)
placement_tips:[string] 3-4 tactical technical interview tips for this candidate`;

const RULES = `Professional Evaluation & Scoring Standards:
1. PRIMARY OBJECTIVE - JD FIT & ACTIONABLE ELEVATION:
   - Your number one goal is to evaluate if the candidate is the best fit for the JD.
   - If not a strong fit, provide direct, high-value suggestions in tech_improvement_ideas, project_suggestions, and section_improvements to make them job-ready.

2. MANDATORY PILLARS:
   - Skills matching with JD (matched, missing, and recommended skills).
   - Projects (require at least 2 well-explained technical projects with tools and architecture).
   - Experience (dated work/internship records with clear explanations).
   - Summary (relevant to the target role/JD).
   - Contact details (Email, Phone, LinkedIn, GitHub / Portfolio).
   - Spelling mistakes & typos (identified constructively in grammar_and_ocr_errors).

3. ABSOLUTE PROHIBITION ON RENAMING PROJECTS:
   - NEVER suggest renaming or changing existing project titles.
   - You cannot know the full context or origin of candidate projects from a brief resume summary.
   - Only suggest technical content additions (e.g., adding metrics, architecture, or tools), never alternative project names.

4. OPTIONAL SECTIONS (NO PENALTIES OR CREDENTIAL DEMANDS):
   - Education, Certifications, and Achievements are strictly optional based on candidate preference.
   - NEVER penalize or reduce scores if a candidate does not list education, certifications, or achievements.
   - NEVER demand credential IDs, license numbers, or verification links for certifications.
   - If certifications or extra projects are present, suggest how to make them directly relevant to the JD.

5. ZERO-HALLUCINATION SCORE INTEGRITY & DISCIPLINE:
   - ATS PRE-COMPUTED FACTS are deterministic facts from the extracted resume. Treat real_ats_score and JD keyword match as authoritative.
   - Never invent metrics, employers, links, dates, or project outcomes. Return clean, valid JSON every time.`;

export function buildMessages(input: {
  fileName: string;
  resumeText: string;
  jobDescription?: string;
  defaultRole?: string;
  companyName?: string;
  atsFacts?: string;
}): Array<{ role: "system" | "user"; content: string }> {
  const roleName = input.defaultRole?.trim() || "Software Engineer (Entry Level)";
  const hasJd = Boolean(input.jobDescription && input.jobDescription.trim().length >= 5);
  const company = input.companyName?.trim() || "the hiring company";

  const resumeArc = classifyRoleArc(input.resumeText);
  const jdTools = hasJd ? detectAiTools(input.jobDescription!) : null;
  const resumeTools = detectAiTools(input.resumeText);
  const toolContext = [
    jdTools && jdTools.hits.length ? `JOB DESCRIPTION TECH & AI STACK → ${jdTools.summary}.` : "",
    resumeTools.hits.length ? `RESUME RECOGNIZED STACK → ${resumeTools.summary}.` : "",
    `RESUME CAREER TRACK / ROLE ARC → ${resumeArc.arc}${resumeArc.matched.length ? ` (signals: ${resumeArc.matched.slice(0, 6).join(", ")})` : ""}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const atsBlock = input.atsFacts ? `\nATS PRE-COMPUTED FACTS & SIGNALS:\n${input.atsFacts}\n` : "";

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `FILE NAME: ${input.fileName}\n\n` +
        `EVALUATION MODE: ${hasJd ? `Specific Job Description at ${company}` : `General Role: ${roleName}`}\n` +
        `EVALUATION BASIS TO SET IN JSON: "${hasJd ? "jd-fit" : "role-fit"}"\n\n` +
        (hasJd ? `JOB DESCRIPTION:\n${input.jobDescription?.trim()}\n\n` : "") +
        (toolContext ? `${toolContext}\n\n` : "") +
        `RESUME TEXT (cleaned and sanitized):\n${capForPrompt(input.resumeText)}\n` +
        atsBlock +
        `\nSCHEMA SPECIFICATION:\n${SCHEMA_SPEC}\n\n` +
        RULES,
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
  if (start === -1) {
    // If no curly brace found, attempt key-value pattern reconstruction
    const nameMatch = text.match(/candidate_name["':\s]+([^"\n\r,]+)/i);
    const scoreMatch = text.match(/overall_score["':\s]+(\d+)/i);
    if (scoreMatch) {
      return {
        candidate_name: nameMatch?.[1]?.trim() || "Unnamed candidate",
        overall_score: Number(scoreMatch[1]),
        readiness_tier:
          Number(scoreMatch[1]) >= 80
            ? "Tier 1: Shortlist Ready"
            : Number(scoreMatch[1]) >= 60
              ? "Tier 2: Needs Minor Polish"
              : "Tier 3: Overhaul Required",
        strengths: ["Evaluated from response text"],
        critical_issues: [],
      };
    }
    throw new LlmError("Model did not return JSON.", null, true);
  }

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
    // Robust salvage for truncated model outputs
    let salvaged = slice.replace(/,\s*([}\]])/g, "$1");
    salvaged = salvaged.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, "");
    salvaged = salvaged.replace(/,\s*$/, "");

    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < salvaged.length; i++) {
      const ch = salvaged[i]!;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces = Math.max(0, openBraces - 1);
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets = Math.max(0, openBrackets - 1);
    }

    const autoClose = "]".repeat(openBrackets) + "}".repeat(openBraces);
    try {
      return JSON.parse(salvaged + autoClose);
    } catch {
      const stripped = salvaged.replace(/\{[^{}]*$/, "").replace(/,\s*$/, "");
      const ob = (stripped.match(/\{/g)?.length ?? 0) - (stripped.match(/\}/g)?.length ?? 0);
      const obk = (stripped.match(/\[/g)?.length ?? 0) - (stripped.match(/\]/g)?.length ?? 0);
      try {
        return JSON.parse(stripped + "]".repeat(Math.max(0, obk)) + "}".repeat(Math.max(0, ob)));
      } catch {
        // Fallback: extract score using regex if structural repair fails
        const scoreMatch = text.match(/overall_score["':\s]+(\d+)/i);
        if (scoreMatch) {
          return {
            overall_score: Number(scoreMatch[1]),
            readiness_tier:
              Number(scoreMatch[1]) >= 80
                ? "Tier 1: Shortlist Ready"
                : Number(scoreMatch[1]) >= 60
                  ? "Tier 2: Needs Minor Polish"
                  : "Tier 3: Overhaul Required",
            strengths: ["Recovered candidate metrics"],
          };
        }
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
    atsFacts?: string;
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
