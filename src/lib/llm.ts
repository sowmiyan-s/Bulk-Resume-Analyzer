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
  "You are an expert Senior Director of Technical Recruiting and Principal Systems Architect. " +
  "You perform authentic, rigorous, evidence-based resume audits for campus placement and engineering roles. " +
  "CRITICAL RULES: NO RANDOM ANALYSIS. NO DUMMY FILLER TEXT. NO FABRICATED PRAISE. " +
  "WHEN A JOB DESCRIPTION (JD) IS PROVIDED, YOU MUST STRICTLY FOCUS ON AND EVALUATE AGAINST THE SPECIFIC REQUIREMENTS, SKILLS, AND TOOLS OF THAT JD. " +
  "Every critique, score, and recommendation must cite verbatim evidence from the candidate's resume and measure direct alignment with the target Job Description (or target role). " +
  "SECTION-BY-SECTION EVALUATION BENCHMARK (100 PTS TOTAL): " +
  "1. Technical Skills Depth & Stack (25 pts max): Alignment with target JD stack (or standard stack), programming languages, modern frameworks, databases, cloud, and developer tooling. " +
  "2. Project Complexity & Architecture (25 pts max): Technical projects showing problem solving, data flow, APIs, database schema, and functional execution relevant to the JD. " +
  "3. Internships & Practical Experience (20 pts max): Hands-on industry experience, quantifiable production contributions, and STRICT RELEVANCE to the Job Description requirements. " +
  "4. Professional Summary & Positioning (10 pts max): Concise, high-impact career positioning without generic clichés ('hardworking', 'passionate'). " +
  "5. Verified Certifications & Accreditations (10 pts max): Recognizable cloud/vendor accreditations (AWS, GCP, Azure, Oracle, Cisco, Kubernetes, etc.) vs unverified completion certificates. " +
  "6. Achievements & Verifiable Proof (10 pts max): Hackathons, competitive programming ratings (LeetCode/Codeforces), open-source PRs, tech publications, and demonstrable awards. " +
  "Reply with one compact, raw JSON object only: no markdown formatting, no commentary.";

/** Compact key list for authentic section-by-section analysis without filler. */
const SCHEMA_SPEC = `Keys (all required, all strings/arrays/objects as typed):
candidate_name:string (Extract candidate's actual person name from the resume header or file name, e.g. 'Sathwik Narayanan', 'R Sukesh', 'Reshma B')
role:string (the target role inferred or specified)
assumed_role:string (the role evaluated against)
evaluation_basis:string ("role-fit" when judged against a default role, "jd-fit" when a JD was supplied)
overall_score:int 0-100 (Sum of the 6 section scores: Skills 25 + Projects 25 + Internships 20 + Summary 10 + Certs 10 + Achievements 10 = 100 max)
readiness_tier:"Tier 1: Shortlist Ready"|"Tier 2: Needs Minor Polish"|"Tier 3: Overhaul Required"
score_breakdown:[{category:"Technical Skills Depth & Stack"|"Project Complexity & Architecture"|"Internships & Practical Track Record (JD-Aligned)"|"Professional Summary & Career Positioning"|"Verified Certifications & Accreditations"|"Achievements, Hackathons & Verifiable Proof",score:int,max:int,note:string}] exactly 6 rows with maxes: 25, 25, 20, 10, 10, 10 (sum to 100)
jd_match:{score:int 0-100,verdict:string} (required: calculate overall 0-100 percentage match against the target Job Description or target role, with concise verdict)
recruiter_first_impression:string (<=35 words: objective technical assessment based on demonstrated competencies)
hr_verdict:string (<=45 words: clear, unbiased hiring recommendation based on verified skills)
strengths:[string] max 3 (top technical competencies, e.g. 'Production backend with FastAPI & Docker', 'Multi-agent AI implementation')
critical_issues:[{severity:"critical"|"major"|"minor",area,problem,evidence,fix}] 1-5 concrete technical gaps, missing core sections, unquantified bullets, or ATS red flags. For any score below 80, you MUST provide explicit critical/major issues detailing what needs fixing. Return [] only if resume is 100% flawless.
grammar_and_ocr_errors:[string] List genuine grammatical errors, typos, and misspelled words. Format each as: '"<incorrect text>" -> "<corrected text>" (<brief explanation>)'. IMPORTANT: Check genuine spelling and grammar ONLY. DO NOT flag capitalization differences, casing (e.g. lowercase skill names like python vs Python), or links/emails. Return [] if clean.
formatting_problems:[string] Genuine ATS blockers (e.g. multi-column layout artefacts, missing contact info, missing dates, excessive length). Return [] if clean.
skill_matrix:{matched_skills:[string],missing_skills:[string],recommended_skills:[string] max 5 each} (List verified technical keywords)
bullet_rewrites:[{original,rewritten,reason}] 2-3 items. Elevate bullet points with concrete technical tools, architecture, and realistic developer metrics (e.g. database indexing, JWT auth, latency reduction, unit tests, Docker). NEVER hallucinate fake enterprise revenue or fictional business metrics.
tech_improvement_ideas:[string] max 4 (concrete tools/frameworks that would elevate their technical stack depth)
project_suggestions:[string] max 2 (concrete engineering project ideas with clear architecture that solve their biggest skill gaps)
structure:{score:int 0-100,label:string ("Excellent"|"Good"|"Needs work"|"Poor"),notes:[string] max 3}
data_gaps:[{area,missing,impact}] max 3 (missing GitHub/live demo links, missing stack details)
relevance:{assumed_role:string, evaluation_basis:string, skills_misaligned:boolean, verdict:string <=35 words}
section_audits:{summary:{score:int 0-10,audit:string,fix_tip:string},skills:{score:int 0-25,matched_keywords:[string],missing_critical_skills:[string],audit:string,fix_tip:string},projects:{score:int 0-25,architecture_rating:string,live_proof:bool,audit:string,fix_tip:string},internships:{score:int 0-20,jd_relevance_pct:int 0-100,jd_relevance_explanation:string,audit:string,fix_tip:string},certifications:{score:int 0-10,verified_count:int,audit:string,fix_tip:string},achievements:{score:int 0-10,audit:string,fix_tip:string}}
section_improvements:[{section:string,current_gap:string,actionable_fix:string}] 3-5 concrete step-by-step section improvements
placement_tips:[string] 3-4 tactical interview & placement tips tailored specifically to this candidate's resume gaps`;

const RULES = `Professional Evaluation & Scoring Standards:
1. HIGH-BAR TIER-1 SDE SHORTLISTING (0-100 CONTINUOUS DISTRIBUTION):
   - Score candidates dynamically and realistically across the entire 0-100 spectrum based on the 6 sections. DO NOT default to clustered numbers (e.g. 92, 82, 72, 62) or multiples of 5/10. Use exact component points (e.g. 22/25, 21/25, 16/20, 8/10, 7/10, 8/10 -> 82).
   - Calibrate strictly across real-world hiring tiers:
     * 90–100 (Tier-1 Shortlist / Top 5% Product Engineer): Production-level architecture (concurrency, caching, vector search, multi-tenant systems, or sandboxed execution), verifiable proof (published NPM/PyPI packages, patents, research papers, national hackathons, high LeetCode rating), clean Docker/cloud deployment, zero ATS flaws.
     * 80–89 (High SDE Match): Solid engineering depth, full-stack or backend systems with robust database schemas, relevant internships, clean STAR-formatted bullets.
     * 70–79 (Good / Needs Minor Polish): Functional projects and relevant tech stack, but lacks distributed scale, live user traction, or cloud containerization.
     * 60–69 (Moderate / Junior Baseline): Basic tutorial-level projects (simple CRUD, standard clones), limited systems depth, minor formatting gaps.
     * 50–59 (Basic Foundation): Junior coursework foundation, superficial skills, missing project implementation.
     * 40–49 (Significant Gaps): Few relevant skills, missing core tools, no live projects or proof.
     * 30–39 (Low Fit): Minimal technical competency, vague bullet points, weak formatting.
     * 20–29 (Minimal Relevance): Barely matching role keywords, non-technical or poorly structured.
     * 10–19 (Very Weak): Severe lack of basic technical knowledge, major ATS red flags.
     * Below 10 (<10): Blank, corrupted, or completely irrelevant resume.

2. RESUME PROFILE & DOMAIN EVALUATION (WHEN NO JD IS PROVIDED):
   - When a custom Job Description is provided, FOCUS ENTIRELY ON THE JD. Align all skill scores, project relevance, internship match, and recommendations to the target JD's required competencies, stack, and domain.
   - When NO specific Job Description is provided, evaluate the candidate fairly based on their actual background, detected domain (e.g., Frontend, Full-Stack, AI/ML, Data Engineering, Backend, Mobile, Embedded), and verified resume skills. DO NOT penalize them with a massive list of arbitrary missing skills or demand unrelated technologies. Only list missing_skills if there is an obvious, essential gap in their own declared stack (e.g. a React dev with no state management/CSS, or a backend dev with no database/API). Keep missing_skills to 0-2 items or [] if their stack is coherent.

3. STRICT INTERNSHIP & JD RELEVANCE:
   - When a custom Job Description is given, rigorously measure how the candidate's past internships, responsibilities, and projects directly align with the requirements of the JD.
   - Calculate an explicit jd_relevance_pct (0-100%) and provide a concise explanation of what overlaps and what is missing.

4. REALISTIC BULLET REWRITES & NO FAKE ENTERPRISE METRICS:
   - When rewriting bullets, elevate technical stack clarity, architectural design, database indexing, authentication, and realistic developer metrics (e.g. 'reduced latency by 35%', 'optimized queries for 1,000+ records', 'built 12 REST endpoints with 90% test coverage').
   - NEVER hallucinate fake enterprise revenue ($2M) or fictional company scale on student projects.

5. MANDATORY CRITICAL ISSUES FOR SCORES UNDER 80 & NO FLUFF:
   - Resumes with scores < 80 or tagged with polish/overhaul requirements must never have empty critical issues.
   - Keep all recruiter impressions and HR verdicts blunt, direct, and actionable without generic corporate buzzwords. Quote verbatim resume text when pointing out flaws.

6. AUTHENTICITY, ANTI-FAKE METRICS & FAIR DOMAIN EVALUATION:
   - Detect fabricated or ChatGPT-stuffed metrics (e.g. an unverified student project claiming '$5M ARR', '10M daily active users', or enterprise scale without company context or live proof).
   - Reward genuine technical depth and proof-of-work: installable packages (PyPI, NPM), published research papers, patents, live demo URLs, GitHub repositories, and concrete system architecture.
   - Fairly evaluate all engineering domains (Full-Stack, Backend, Frontend, Systems, AI/ML, Data Engineering, Embedded/IoT, CyberSec, Mobile).

7. GEN-AI GRAMMAR AUDIT & STRICT EXCLUSIONS:
   - Identify real spelling errors, typos, and genuine grammatical syntax errors.
   - ABSOLUTE PROHIBITIONS:
     (1) NEVER report links, GitHub URLs (e.g. github.com/username), LinkedIn URLs, portfolio domains, or emails as grammar or spelling mistakes.
     (2) NEVER report capitalization differences, brand casing (e.g., 'python' vs 'Python', 'javascript' vs 'JavaScript', lowercase tool names, or title capitalization) as grammar or spelling errors. Check actual spelling and typos only.`;

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
