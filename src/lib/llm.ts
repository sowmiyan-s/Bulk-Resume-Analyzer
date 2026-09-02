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
  maxTokens: 3500,
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
  "You are a Principal Engineering Director and Senior Technical Hiring Manager. " +
  "You evaluate candidates on REAL ENGINEERING CAPABILITY, PRACTICAL PROJECTS, TECH STACK DEPTH, AND PROBLEM-SOLVING ABILITY. " +
  "CRITICAL PHILOSOPHY: PRIORITIZE ACTUAL TECHNICAL TALENT OVER SUPERFICIAL ENGLISH GRAMMAR, CASING, OR TEMPLATE FORMATTING. " +
  "Do NOT penalize a strong developer for minor grammatical quirks, lack of corporate buzzwords, or simple resume layout. " +
  "If a candidate has built substantial technical projects, full-stack applications, databases, AI/ML pipelines, or APIs, REWARD THEM WITH HIGH SCORES (80-95+). " +
  "EVALUATION BENCHMARK (100 PTS TOTAL - 100% TALENT FOCUSED): " +
  "1. Technical Skills Depth & Core Stack (30 pts max): Languages (C++, Java, Python, TypeScript, Go, etc.), modern frameworks (React, Node, Django, FastAPI, Spring, etc.), databases (PostgreSQL, MongoDB, Redis), and developer tools (Docker, Git, Linux, Cloud). " +
  "2. Project Complexity & Systems Architecture (35 pts max): Depth of projects built, full-stack integration, backend APIs, data flow, complexity, and demonstrable working code. " +
  "3. Practical Track Record & Internships (20 pts max): Real-world application, internships, practical contributions, open-source code, and alignment with target role/JD. " +
  "4. Achievements, Verifiable Proof & Extracurriculars (15 pts max): Hackathons, GitHub repositories, live demo links, competitive programming (LeetCode/Codeforces), technical awards, or accreditations. " +
  "Reply with one compact, raw JSON object only: no markdown formatting, no commentary.";

/** Compact key list for authentic engineering talent analysis without filler. */
const SCHEMA_SPEC = `Keys (all required, all strings/arrays/objects as typed):
candidate_name:string (Extract candidate's actual name from resume header or file name)
role:string (target role inferred or specified)
assumed_role:string (role evaluated against)
evaluation_basis:string ("role-fit" when judged against a default role, "jd-fit" when a JD was supplied)
overall_score:int 0-100 (Real talent score: Skills 30 + Projects 35 + Experience 20 + Proof 15 = 100 max)
readiness_tier:"Tier 1: Shortlist Ready"|"Tier 2: Needs Minor Polish"|"Tier 3: Overhaul Required"
score_breakdown:[{category:"Technical Skills Depth & Core Stack"|"Project Complexity & Systems Architecture"|"Practical Track Record & Internships"|"Achievements, Verifiable Proof & Code Links"|"Professional Summary & Career Positioning"|"Verified Certifications & Accreditations",score:int,max:int,note:string}] exactly 6 rows (maxes: 30, 35, 20, 15, 0, 0 or equivalent summing to 100)
jd_match:{score:int 0-100,verdict:string} (required: percentage alignment of technical competencies to JD requirements)
recruiter_first_impression:string (<=35 words: blunt, authentic assessment of candidate's technical skills and project depth)
hr_verdict:string (<=45 words: clear hiring recommendation based on verified engineering capabilities)
strengths:[string] max 3 (top concrete technical strengths, e.g. 'Built microservices with FastAPI & Redis', 'Solid full-stack Next.js + PostgreSQL integration')
critical_issues:[{severity:"critical"|"major"|"minor",area,problem,evidence,fix}] Only flag genuine technical dealbreakers (e.g. missing contact email/phone, completely missing projects, or 0% match with required tech stack). DO NOT flag grammar, typos, or layout quirks as critical issues. Return [] if the candidate has a functional technical profile.
grammar_and_ocr_errors:[string] Informational only: genuine misspelled words (e.g. '"algoritm" -> "algorithm"'). Return [] if clean.
formatting_problems:[string] Informational only: missing contact info or unreadable blocks. Return [] if clean.
skill_matrix:{matched_skills:[string],missing_skills:[string],recommended_skills:[string] max 5 each} (Verified technical keywords)
bullet_rewrites:[{original,rewritten,reason}] 2-3 items. Elevate bullet points with concrete technical tools, architecture, and realistic developer metrics.
tech_improvement_ideas:[string] max 4 (concrete tools/frameworks that would elevate their technical stack depth)
project_suggestions:[string] max 2 (advanced engineering project ideas to take their skills to production level)
structure:{score:int 0-100,label:string ("Excellent"|"Good"|"Needs work"|"Poor"),notes:[string] max 3}
data_gaps:[{area,missing,impact}] max 3 (missing GitHub/live demo links, missing stack details)
relevance:{assumed_role:string, evaluation_basis:string, skills_misaligned:boolean, verdict:string <=35 words}
section_audits:{summary:{score:int 0-10,audit:string,fix_tip:string},skills:{score:int 0-30,matched_keywords:[string],missing_critical_skills:[string],audit:string,fix_tip:string},projects:{score:int 0-35,architecture_rating:string,live_proof:bool,audit:string,fix_tip:string},internships:{score:int 0-20,jd_relevance_pct:int 0-100,jd_relevance_explanation:string,audit:string,fix_tip:string},certifications:{score:int 0-5,verified_count:int,audit:string,fix_tip:string},achievements:{score:int 0-10,audit:string,fix_tip:string}}
section_improvements:[{section:string,current_gap:string,actionable_fix:string}] 3-5 concrete technical suggestions
placement_tips:[string] 3-4 tactical technical interview tips for this candidate`;

const RULES = `Professional Evaluation & Scoring Standards:
1. TALENT-FIRST SDE EVALUATION (0-100 SCALE):
   - Score candidates based on REAL CODING, ARCHITECTURAL, AND TECHNICAL MERIT.
   - High Scores (80-95+): Awarded to candidates with multi-tier projects, solid full-stack/backend/systems apps, databases, modern languages (Python, Java, C++, TypeScript, Go), and practical problem solving. Minor grammar or single-column layout must NEVER lower their score below 80.
   - Moderate Scores (65-79): Candidate has foundational projects (e.g. CRUD apps, academic assignments) and basic languages, but lacks complex architecture or live deployment.
   - Low Scores (<65): Candidate has no technical projects, no recognizable programming stack, or non-technical background.

2. ABSOLUTE BAN ON GRAMMAR & TEMPLATE PENALTIES:
   - NEVER reduce overall scores for imperfect English grammar, spelling typos, or simple visual formatting.
   - We are hiring SOFTWARE ENGINEERS, not English copywriters. Judge their code, stack, problem solving, and architecture.

3. JOB DESCRIPTION (JD) RELEVANCE:
   - When a JD is provided, evaluate how their technical skills and projects overlap with the JD's required technologies and responsibilities.
   - When no JD is provided, evaluate them fairly based on their chosen engineering domain (Frontend, Backend, Full-Stack, AI/ML, Systems, Data).`;

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
