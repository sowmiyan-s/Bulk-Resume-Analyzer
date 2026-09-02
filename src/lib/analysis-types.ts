/**
 * Canonical analysis shape + a defensive normalizer.
 *
 * The normalizer is the contract boundary: whatever shape the model returns
 * (snake_case, camelCase, missing keys, strings where numbers belong), the app
 * only ever sees a fully-populated Analysis. This is what stops one bad model
 * response from crashing a 300-resume batch.
 */

import type { AtsReport, AtsCheck } from "./ats-engine";
import { extractCandidateName } from "./sanitize";
import { getTrackRecommendations } from "./role-taxonomy";

export type Severity = "critical" | "major" | "minor";

export type ReadinessTier =
  "Tier 1: Shortlist Ready" | "Tier 2: Needs Minor Polish" | "Tier 3: Overhaul Required";

export type Issue = {
  severity: Severity;
  area: string;
  problem: string;
  evidence: string;
  fix: string;
};

export type ScoreRow = { category: string; score: number; max: number; note: string };

export type BulletRewrite = { original: string; rewritten: string; reason: string };

export type SkillMatrix = {
  matched: string[];
  missing: string[];
  /** Tech the student should learn next, ordered by hiring impact. */
  recommended: string[];
};

export type RelevanceVerdict = {
  /** How this resume was judged when no JD was supplied. */
  assumedRole: string;
  /** "role-fit" when we inferred a role, "jd-fit" when a JD was supplied. */
  evaluationBasis: "role-fit" | "jd-fit";
  /** True when the listed skills/projects look disconnected from the assumed role. */
  skillsMisaligned: boolean;
  /** Plain-language statement of why the resume is (or isn't) a fit for the basis. */
  verdict: string;
};

export type DataGap = {
  area: string;
  missing: string;
  impact: string;
};

export type SectionAudit = {
  score: number;
  max: number;
  audit: string;
  fixTip: string;
};

export type SkillsSectionAudit = SectionAudit & {
  matchedKeywords: string[];
  missingCriticalSkills: string[];
};

export type ProjectsSectionAudit = SectionAudit & {
  architectureRating: string;
  liveProof: boolean;
};

export type InternshipSectionAudit = SectionAudit & {
  jdRelevancePct: number;
  jdRelevanceExplanation: string;
};

export type CertificationsSectionAudit = SectionAudit & {
  verifiedCount: number;
};

export type SectionAudits = {
  summary: SectionAudit;
  skills: SkillsSectionAudit;
  projects: ProjectsSectionAudit;
  internships: InternshipSectionAudit;
  certifications: CertificationsSectionAudit;
  achievements: SectionAudit;
};

export type SectionImprovement = {
  section: string;
  currentGap: string;
  actionableFix: string;
};

export type StructureAssessment = {
  /** 0-100: how cleanly a human + an ATS can parse and scan this resume. */
  score: number;
  /** "Excellent" | "Good" | "Needs work" | "Poor" */
  label: string;
  notes: string[];
};

export type ScoreCategoryId =
  | "all"
  | "90-100"
  | "80-90"
  | "70-80"
  | "60-70"
  | "50-60"
  | "40-50"
  | "30-40"
  | "20-30"
  | "10-20"
  | "below-10";

export type ScoreCategoryDef = {
  id: ScoreCategoryId;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  description: string;
};

export const SCORE_CATEGORIES: ScoreCategoryDef[] = [
  {
    id: "all",
    label: "All Candidates",
    shortLabel: "All",
    min: 0,
    max: 100,
    badgeBg: "bg-secondary",
    badgeBorder: "border-border",
    badgeText: "text-foreground",
    description: "All evaluated candidates",
  },
  {
    id: "90-100",
    label: "90–100 (Exceptional)",
    shortLabel: "90–100",
    min: 90,
    max: 100,
    badgeBg: "bg-emerald-500/15",
    badgeBorder: "border-emerald-500/30",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    description: "Exceptional / Production-Ready",
  },
  {
    id: "80-90",
    label: "80–89 (High Match)",
    shortLabel: "80–89",
    min: 80,
    max: 89,
    badgeBg: "bg-teal-500/15",
    badgeBorder: "border-teal-500/30",
    badgeText: "text-teal-600 dark:text-teal-400",
    description: "High Match & Solid Depth",
  },
  {
    id: "70-80",
    label: "70–79 (Good / Polish)",
    shortLabel: "70–79",
    min: 70,
    max: 79,
    badgeBg: "bg-sky-500/15",
    badgeBorder: "border-sky-500/30",
    badgeText: "text-sky-600 dark:text-sky-400",
    description: "Good Foundation, Minor Polish",
  },
  {
    id: "60-70",
    label: "60–69 (Moderate)",
    shortLabel: "60–69",
    min: 60,
    max: 69,
    badgeBg: "bg-amber-500/15",
    badgeBorder: "border-amber-500/30",
    badgeText: "text-amber-600 dark:text-amber-400",
    description: "Moderate / Basic Projects",
  },
  {
    id: "50-60",
    label: "50–59 (Basic Foundation)",
    shortLabel: "50–59",
    min: 50,
    max: 59,
    badgeBg: "bg-yellow-500/15",
    badgeBorder: "border-yellow-500/30",
    badgeText: "text-yellow-600 dark:text-yellow-400",
    description: "Basic Junior Foundation",
  },
  {
    id: "40-50",
    label: "40–49 (Significant Gaps)",
    shortLabel: "40–49",
    min: 40,
    max: 49,
    badgeBg: "bg-orange-500/15",
    badgeBorder: "border-orange-500/30",
    badgeText: "text-orange-600 dark:text-orange-400",
    description: "Significant Skill Gaps",
  },
  {
    id: "30-40",
    label: "30–39 (Low Fit)",
    shortLabel: "30–39",
    min: 30,
    max: 39,
    badgeBg: "bg-orange-600/15",
    badgeBorder: "border-orange-600/30",
    badgeText: "text-orange-700 dark:text-orange-400",
    description: "Low Fit / Major Missing Competencies",
  },
  {
    id: "20-30",
    label: "20–29 (Minimal)",
    shortLabel: "20–29",
    min: 20,
    max: 29,
    badgeBg: "bg-red-500/15",
    badgeBorder: "border-red-500/30",
    badgeText: "text-red-500 dark:text-red-400",
    description: "Minimal Relevance",
  },
  {
    id: "10-20",
    label: "10–19 (Very Weak)",
    shortLabel: "10–19",
    min: 10,
    max: 19,
    badgeBg: "bg-rose-600/15",
    badgeBorder: "border-rose-600/30",
    badgeText: "text-rose-600 dark:text-rose-400",
    description: "Very Weak / Severe Flaws",
  },
  {
    id: "below-10",
    label: "Below 10 (Unsuitable)",
    shortLabel: "<10",
    min: 0,
    max: 9,
    badgeBg: "bg-rose-950/20",
    badgeBorder: "border-rose-900/40",
    badgeText: "text-rose-700 dark:text-rose-300",
    description: "Unsuitable / Incompatible",
  },
];

export function getScoreCategory(score: number): ScoreCategoryDef {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 90) return SCORE_CATEGORIES[1]!;
  if (s >= 80) return SCORE_CATEGORIES[2]!;
  if (s >= 70) return SCORE_CATEGORIES[3]!;
  if (s >= 60) return SCORE_CATEGORIES[4]!;
  if (s >= 50) return SCORE_CATEGORIES[5]!;
  if (s >= 40) return SCORE_CATEGORIES[6]!;
  if (s >= 30) return SCORE_CATEGORIES[7]!;
  if (s >= 20) return SCORE_CATEGORIES[8]!;
  if (s >= 10) return SCORE_CATEGORIES[9]!;
  return SCORE_CATEGORIES[10]!;
}

export type Analysis = {
  candidateName: string;
  role: string;
  overallScore: number;
  readinessTier: ReadinessTier;
  scoreBreakdown: ScoreRow[];
  hrVerdict: string;
  recruiterFirstImpression: string;
  strengths: string[];
  criticalIssues: Issue[];
  grammarAndOcrErrors: string[];
  formattingProblems: string[];
  skillMatrix: SkillMatrix;
  bulletRewrites: BulletRewrite[];
  techImprovementIdeas: string[];
  projectSuggestions: string[];
  jdScore: number | null;
  jdVerdict: string;
  /** Set by the officer in the Rectify drawer; overrides overallScore for ranking. */
  manualScore: number | null;
  officerNotes: string;

  /* ---- Section-by-Section Real Assessment Architecture ---- */
  sectionAudits: SectionAudits;
  sectionImprovements: SectionImprovement[];
  placementTips: string[];

  /* ---- v2: clarity, honesty & role-relevance ---- */
  /** The role the model judged the resume against when no JD was given. */
  assumedRole: string;
  /** How the evaluation was framed. */
  evaluationBasis: "role-fit" | "jd-fit";
  /** Document structure / scannability / ATS parseability, scored. */
  structure: StructureAssessment;
  /** Concrete missing-data flags (no metrics, no dates, no contact, thin projects…). */
  dataGaps: DataGap[];
  /** Role-relevance verdict: is the resume actually aimed at the assumed role? */
  relevance: RelevanceVerdict;

  /* ---- High-level role arc + GenAI / domestic-AI tool intelligence ---- */
  /** Career spine the resume was classified into (e.g. "Generative AI / LLM Builder"). */
  roleArc: string;
  /** GenAI / domestic-AI tool taxonomy detected (models, frameworks, GPU stacks). */
  toolTaxonomy: {
    summary: string;
    categories: string[];
    hasDomestic: boolean;
    hasGlobal: boolean;
    tools: string[];
  };

  /* ---- Deterministic Rule-Based ATS Engine Report ---- */
  ats: AtsReport | null;
  /** True when AI call timed out/failed or rule-based only mode was selected. */
  isRuleBasedFallback?: boolean;
};

/* ------------------------------- coercion ------------------------------- */

const str = (v: unknown, fallback = ""): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
};

const num = (v: unknown, fallback = 0): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number.parseFloat(v.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Accepts arrays of strings OR arrays of objects, flattening objects to text. */
const strArr = (v: unknown): string[] =>
  arr(v)
    .map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        return str(
          o["text"] ??
            o["issue"] ??
            o["error"] ??
            o["description"] ??
            o["problem"] ??
            o["skill"] ??
            o["idea"] ??
            o["tip"],
        );
      }
      return str(x);
    })
    .filter(Boolean);

/** Reads the first key that exists, so snake_case and camelCase both work. */
const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

function toTier(v: unknown, score: number, hasHardBlockers = false): ReadinessTier {
  if (hasHardBlockers || score < 65) return "Tier 3: Overhaul Required";
  const s = str(v).toLowerCase();
  if (s.includes("tier 1") || s.includes("shortlist") || score >= 80) return "Tier 1: Shortlist Ready";
  if (s.includes("tier 2") || s.includes("polish") || (score >= 65 && score < 80)) return "Tier 2: Needs Minor Polish";
  return "Tier 3: Overhaul Required";
}

function toIssues(v: unknown): Issue[] {
  return arr(v).map((raw) => {
    if (typeof raw === "string") {
      return {
        severity: "major" as Severity,
        area: "General",
        problem: raw,
        evidence: "",
        fix: "",
      };
    }
    const o = (raw ?? {}) as Record<string, unknown>;
    const sev = str(pick(o, "severity", "level", "priority"), "major").toLowerCase();
    const severity: Severity = sev.startsWith("crit")
      ? "critical"
      : sev.startsWith("min") || sev.startsWith("low")
        ? "minor"
        : "major";
    return {
      severity,
      area: str(pick(o, "area", "category", "section"), "General"),
      problem: str(pick(o, "problem", "issue", "description", "text")),
      evidence: str(pick(o, "evidence", "quote", "example")),
      fix: str(pick(o, "fix", "recommendation", "suggestion", "action")),
    };
  });
}

function toRewrites(v: unknown): BulletRewrite[] {
  return arr(v)
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      return {
        original: str(pick(o, "original", "before", "current")),
        rewritten: str(pick(o, "rewritten", "after", "improved", "suggested")),
        reason: str(pick(o, "reason", "why", "rationale", "explanation")),
      };
    })
    .filter((r) => r.original || r.rewritten);
}

function toDataGaps(v: unknown): DataGap[] {
  return arr(v)
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      if (typeof raw === "string") {
        return { area: "Completeness", missing: raw, impact: "" };
      }
      return {
        area: str(pick(o, "area", "section", "category"), "Completeness"),
        missing: str(pick(o, "missing", "gap", "what", "issue")),
        impact: str(pick(o, "impact", "why", "consequence", "effect")),
      };
    })
    .filter((g) => g.missing);
}

function toStructure(v: unknown): StructureAssessment {
  const o = (v ?? {}) as Record<string, unknown>;
  const score = clamp(num(pick(o, "score", "rating", "structure_score")), 0, 100);
  const labelRaw = str(pick(o, "label", "grade", "rating_label")).toLowerCase();
  const label: StructureAssessment["label"] =
    labelRaw.includes("exc") || score >= 85
      ? "Excellent"
      : labelRaw.includes("poor") || score < 50
        ? "Poor"
        : labelRaw.includes("work") || score < 70
          ? "Needs work"
          : "Good";
  const notes = strArr(pick(o, "notes", "feedback", "observations", "issues"));
  return { score, label, notes };
}

function toRelevance(
  v: unknown,
  fallbackRole: string,
  basis: "role-fit" | "jd-fit",
): RelevanceVerdict {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    assumedRole: str(pick(o, "assumed_role", "assumedRole", "inferred_role"), fallbackRole),
    evaluationBasis: (str(pick(o, "evaluation_basis", "evaluationBasis"))
      .toLowerCase()
      .includes("jd")
      ? "jd-fit"
      : basis) as "role-fit" | "jd-fit",
    skillsMisaligned: /true|y|1/.test(
      str(pick(o, "skills_misaligned", "skillsMisaligned", "misaligned")).toLowerCase(),
    ),
    verdict: str(pick(o, "verdict", "summary", "assessment")),
  };
}

function toSectionAudits(v: unknown, breakdown: ScoreRow[]): SectionAudits {
  const o = (v ?? {}) as Record<string, unknown>;
  const sumRaw = (pick(o, "summary", "summary_audit", "professional_summary") ?? {}) as Record<
    string,
    unknown
  >;
  const sklRaw = (pick(o, "skills", "skills_audit", "technical_skills_audit", "technical_skills") ??
    {}) as Record<string, unknown>;
  const prjRaw = (pick(o, "projects", "projects_audit", "project_work") ?? {}) as Record<
    string,
    unknown
  >;
  const expRaw = (pick(
    o,
    "internships",
    "internship_experience_audit",
    "internship_experience",
    "internships_audit",
    "experience",
  ) ?? {}) as Record<string, unknown>;
  const cerRaw = (pick(o, "certifications", "certifications_audit", "accreditations") ??
    {}) as Record<string, unknown>;
  const achRaw = (pick(o, "achievements", "achievements_audit", "awards") ?? {}) as Record<
    string,
    unknown
  >;

  const findScore = (key: string, defScore: number, maxVal: number) => {
    const row = breakdown.find((b) => b.category.toLowerCase().includes(key));
    if (row) return Math.min(maxVal, Math.round((row.score / (row.max || 100)) * maxVal));
    return defScore;
  };

  return {
    summary: {
      score: clamp(num(pick(sumRaw, "score"), findScore("summary", 8, 10)), 0, 10),
      max: 10,
      audit: str(
        pick(sumRaw, "audit", "critique", "assessment"),
        "Evaluated for professional clarity, career alignment, and concise technical impact.",
      ),
      fixTip: str(
        pick(sumRaw, "fix_tip", "fixTip", "tip", "recommendation"),
        "Lead with technical domain focus, total projects/internships built, and core modern stack.",
      ),
    },
    skills: {
      score: clamp(num(pick(sklRaw, "score"), findScore("skills", 25, 30)), 0, 30),
      max: 30,
      audit: str(
        pick(sklRaw, "audit", "critique", "assessment"),
        "Evaluated depth of modern frameworks, programming languages, database systems, and developer tooling.",
      ),
      fixTip: str(
        pick(sklRaw, "fix_tip", "fixTip", "tip", "recommendation"),
        "Categorize skills cleanly by Languages, Backend, Frontend, Cloud & Databases with explicit versions.",
      ),
      matchedKeywords: strArr(pick(sklRaw, "matched_keywords", "matchedKeywords", "matched")),
      missingCriticalSkills: strArr(
        pick(sklRaw, "missing_critical_skills", "missingCriticalSkills", "missing"),
      ),
    },
    projects: {
      score: clamp(num(pick(prjRaw, "score"), findScore("project", 28, 35)), 0, 35),
      max: 35,
      audit: str(
        pick(prjRaw, "audit", "critique", "assessment"),
        "Evaluated project architecture complexity, API integrations, data modeling, and verifiable deployments.",
      ),
      fixTip: str(
        pick(prjRaw, "fix_tip", "fixTip", "tip", "recommendation"),
        "Detail backend architecture, schema design, latency metrics, and verifiable GitHub / live demo links.",
      ),
      architectureRating: str(
        pick(prjRaw, "architecture_rating", "architectureRating", "complexity"),
        "Production Architecture",
      ),
      liveProof: Boolean(pick(prjRaw, "live_proof", "liveProof", "has_links", "verifiable")),
    },
    internships: {
      score: clamp(num(pick(expRaw, "score"), findScore("internship", 16, 20)), 0, 20),
      max: 20,
      jdRelevancePct: clamp(
        num(pick(expRaw, "jd_relevance_pct", "jdRelevancePct", "relevance_pct", "relevance"), 80),
        0,
        100,
      ),
      jdRelevanceExplanation: str(
        pick(expRaw, "jd_relevance_explanation", "jdRelevanceExplanation", "relevance_explanation"),
        "Assessed direct mapping between practical responsibilities and target job requirements.",
      ),
      audit: str(
        pick(expRaw, "audit", "critique", "assessment"),
        "Evaluated hands-on production code contributions, quantifiable business impact, and workflow ownership.",
      ),
      fixTip: str(
        pick(expRaw, "fix_tip", "fixTip", "tip", "recommendation"),
        "Structure bullets with STAR method (Situation, Task, Action, Measurable Metric Outcome).",
      ),
    },
    certifications: {
      score: clamp(num(pick(cerRaw, "score"), findScore("cert", 4, 5)), 0, 5),
      max: 5,
      audit: str(
        pick(cerRaw, "audit", "critique", "assessment"),
        "Evaluated verifiable vendor/cloud accreditations (AWS, GCP, Azure, Oracle, Cisco, Kubernetes).",
      ),
      fixTip: str(
        pick(cerRaw, "fix_tip", "fixTip", "tip", "recommendation"),
        "Include verifiable credential IDs, issue dates, and credential links for verified cloud certifications.",
      ),
      verifiedCount: clamp(num(pick(cerRaw, "verified_count", "verifiedCount", "count"), 1), 0, 10),
    },
    achievements: {
      score: clamp(num(pick(achRaw, "score"), findScore("achieve", 12, 15)), 0, 15),
      max: 15,
      audit: str(
        pick(achRaw, "audit", "critique", "assessment"),
        "Evaluated hackathons, competitive programming ranks, tech awards, open-source PRs, and verifiable proof.",
      ),
      fixTip: str(
        pick(achRaw, "fix_tip", "fixTip", "tip", "recommendation"),
        "Highlight competitive ratings (LeetCode, Codeforces), hackathon podium placements, and open source contributions.",
      ),
    },
  };
}

function toSectionImprovements(v: unknown): SectionImprovement[] {
  return arr(v)
    .map((raw) => {
      if (typeof raw === "string") {
        return { section: "General", currentGap: raw, actionableFix: "" };
      }
      const o = (raw ?? {}) as Record<string, unknown>;
      return {
        section: str(pick(o, "section", "area", "category"), "Section"),
        currentGap: str(pick(o, "current_gap", "currentGap", "gap", "flaw", "problem", "issue")),
        actionableFix: str(
          pick(o, "actionable_fix", "actionableFix", "fix", "solution", "tip", "action"),
        ),
      };
    })
    .filter((s) => s.currentGap || s.actionableFix);
}

// Formatting & Grammar error filters — Filter out URLs, GitHub/LinkedIn links, emails, and capitalization checks
const isLinkOrEmailPattern = (s: string) =>
  /(?:https?:\/\/|www\.|github\.com|linkedin\.com|gitlab\.com|leetcode\.com|@|\.(?:dev|io|app|com|in|org)\b)/i.test(
    s,
  );

const isCapitalizationOrCasing = (s: string) =>
  /\[capitalization\]|\b(?:casing|capitalize|capitalization|uppercase|lowercase pronoun|brand casing)\b/i.test(
    s,
  );

export function normalizeAnalysis(
  raw: unknown,
  atsReport?: AtsReport | null,
  fallbackCleanText?: string,
  fileName?: string,
): Analysis {
  const o = (raw ?? {}) as Record<string, unknown>;
  const matrixRaw = (pick(o, "skill_matrix", "skillMatrix") ?? {}) as Record<string, unknown>;
  const jdRaw = (pick(o, "jd_match", "jdMatch") ?? {}) as Record<string, unknown>;
  const rawJdScore = pick(jdRaw, "score") ?? pick(o, "jd_score", "jdScore");

  const ats: AtsReport | null =
    atsReport !== undefined
      ? atsReport
      : ((pick(o, "ats", "atsReport") as AtsReport | undefined) ?? null);

  const breakdown = arr(pick(o, "score_breakdown", "scoreBreakdown")).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    const max = num(pick(row, "max", "outOf"), 100) || 100;
    const score = Math.max(0, Math.min(max, num(pick(row, "score", "value"))));
    return {
      category: str(pick(row, "category", "name"), "Category"),
      score,
      max,
      note: str(pick(row, "note", "comment", "reason")),
    };
  });

  const explicitBasis = str(pick(o, "evaluation_basis", "evaluationBasis")).toLowerCase().trim();
  const hasCustomJdInAts = Boolean(ats?.categories.some((c) => c.checks.some((k) => k.id === "jd-skills")));
  const basis: "role-fit" | "jd-fit" =
    explicitBasis === "jd-fit" || (explicitBasis !== "role-fit" && hasCustomJdInAts)
      ? "jd-fit"
      : "role-fit";

  const jdScoreNum =
    rawJdScore !== undefined && rawJdScore !== null ? clamp(num(rawJdScore)) : null;
  const sumBreakdown = breakdown.length >= 3 ? breakdown.reduce((acc, b) => acc + b.score, 0) : 0;
  const explicitOverall = pick(o, "overall_score", "overallScore", "score");
  
  // Authentic scoring: preserve the exact score evaluated by the model / section breakdown
  const overallScore =
    explicitOverall !== undefined
      ? clamp(num(explicitOverall))
      : sumBreakdown > 0
        ? clamp(sumBreakdown)
        : jdScoreNum !== null
          ? jdScoreNum
          : 0;

  const finalJdScore =
    rawJdScore !== undefined && rawJdScore !== null
      ? clamp(num(rawJdScore))
      : ats?.jdScore !== null && ats?.jdScore !== undefined
        ? ats.jdScore
        : clamp(Math.round(overallScore * 0.88));

  const inferredRole = str(
    pick(
      o,
      "assumed_role",
      "assumedRole",
      "inferred_role",
      "role",
      "target_role",
      "targetRole",
      "title",
    ),
    "—",
  );

  const sectionAudits = toSectionAudits(
    pick(o, "section_audits", "sectionAudits", "sections"),
    breakdown,
  );

  const finalBreakdown: ScoreRow[] =
    breakdown.length > 0
      ? breakdown
      : [
          {
            category: "Technical Skills Depth & Core Stack",
            score: sectionAudits.skills.score,
            max: 30,
            note: sectionAudits.skills.audit,
          },
          {
            category: "Project Complexity & Systems Architecture",
            score: sectionAudits.projects.score,
            max: 35,
            note: sectionAudits.projects.audit,
          },
          {
            category: "Practical Track Record & Internships",
            score: sectionAudits.internships.score,
            max: 20,
            note: sectionAudits.internships.audit,
          },
          {
            category: "Achievements, Verifiable Proof & Code Links",
            score: sectionAudits.achievements.score,
            max: 15,
            note: sectionAudits.achievements.audit,
          },
        ];

  const matchedSkills = strArr(
    pick(matrixRaw, "matched_skills", "matched_keywords", "matched", "present") ??
      pick(o, "matched_skills", "matched_keywords"),
  );
  const missingSkills = strArr(
    pick(matrixRaw, "missing_skills", "missing_critical_skills", "missing", "gaps") ??
      pick(o, "missing_skills", "missingKeywords", "missing_critical_skills"),
  );

  // Candidate Name extraction
  const rawModelName = str(pick(o, "candidate_name", "candidateName", "name"), "");
  const candidateName =
    rawModelName &&
    !rawModelName.toLowerCase().includes("unnamed") &&
    rawModelName.length >= 2 &&
    !/^(candidate|resume|cv|document|profile|career\s+objective|summary)$/i.test(rawModelName.trim())
      ? rawModelName
      : extractCandidateName(fallbackCleanText, fileName);

  const rawIssues = toIssues(pick(o, "critical_issues", "criticalIssues", "issues"));
  let criticalIssues = [...rawIssues];

  // Derive genuine readiness tier from the real score
  const hasHardBlockers = (ats?.blockers.length ?? 0) > 0;
  const readinessTier = toTier(pick(o, "readiness_tier", "readinessTier", "tier"), overallScore, hasHardBlockers);

  if (criticalIssues.length === 0 && (overallScore < 80 || hasHardBlockers)) {
    // 1. Add ATS blockers
    if (ats?.blockers.length) {
      for (const b of ats.blockers) {
        criticalIssues.push({
          severity: "critical",
          area: "ATS Hard Blocker",
          problem: b,
          evidence: "Deterministic ATS engine check",
          fix: "Resolve layout or missing contact details to pass ATS screeners.",
        });
      }
    }

    // 2. Add missing sections
    if (ats?.metrics.sectionsMissing.length) {
      for (const s of ats.metrics.sectionsMissing) {
        if (s === "Experience / Internships" && ats.metrics.sectionsFound.includes("Projects")) {
          continue;
        }
        criticalIssues.push({
          severity: s === "Projects" || s === "Education" || s === "Skills" ? "critical" : "major",
          area: "Missing Section",
          problem: `Dedicated ${s} section is missing from the resume.`,
          evidence: `Resume does not contain a recognizable '${s}' header`,
          fix: `Add a structured '${s}' section with relevant bullet points.`,
        });
      }
    }

    // 3. Add unquantified bullet issue
    if (ats && ats.metrics.bullets > 0 && ats.metrics.quantifiedBullets === 0) {
      criticalIssues.push({
        severity: "major",
        area: "Quantified Impact",
        problem: "No measurable outcomes (%, numbers, latency, scale) detected in bullet points.",
        evidence: `${ats.metrics.bullets} bullet points found, 0 contain metrics.`,
        fix: "Quantify achievements using STAR format (e.g. 'reduced latency by 40%', 'served 10k users').",
      });
    }

    // 4. Add missing skills issue
    if (missingSkills.length > 0) {
      criticalIssues.push({
        severity: "major",
        area: "Technical Gaps",
        problem: `Missing core role competencies: ${missingSkills.slice(0, 3).join(", ")}.`,
        evidence: `Keywords not found in resume stack: ${missingSkills.slice(0, 3).join(", ")}`,
        fix: `Incorporate verifiable project work and hands-on usage of ${missingSkills.slice(0, 2).join(" & ")}.`,
      });
    }
  }

  // Deduplicate critical issues by problem text
  const seenIssueProblems = new Set<string>();
  const dedupedCriticalIssues: Issue[] = [];
  for (const issue of criticalIssues) {
    const key = (issue.problem || issue.area || "").toLowerCase().trim();
    if (key && !seenIssueProblems.has(key)) {
      seenIssueProblems.add(key);
      dedupedCriticalIssues.push(issue);
    }
  }

  // Formatting & Grammar errors — Filter out URLs, GitHub/LinkedIn links, emails, and capitalization checks
  const rawGrammar = strArr(pick(o, "grammar_and_ocr_errors", "grammarAndOcrErrors", "grammar_errors"))
    .filter((g) => !isLinkOrEmailPattern(g) && !isCapitalizationOrCasing(g));
  const atsGrammar = (ats?.metrics.grammarErrorsList ?? [])
    .filter((g) => !isLinkOrEmailPattern(g) && !isCapitalizationOrCasing(g));

  const seenGrammar = new Set<string>();
  const mergedGrammar: string[] = [];
  for (const g of [...rawGrammar, ...atsGrammar]) {
    const normalized = g.toLowerCase().replace(/['"]/g, "").trim();
    if (normalized && !seenGrammar.has(normalized)) {
      seenGrammar.add(normalized);
      mergedGrammar.push(g);
    }
  }

  const rawFormatting = strArr(pick(o, "formatting_problems", "formattingProblems", "formatting_issues"));
  const atsFormatting = (ats?.categories.find((c) => c.id === "format")?.checks ?? [])
    .filter((k) => !k.passed)
    .map((k) => k.detail);

  const seenFormatting = new Set<string>();
  const mergedFormatting: string[] = [];
  for (const f of [...rawFormatting, ...atsFormatting]) {
    const norm = f.toLowerCase().trim();
    if (norm && !seenFormatting.has(norm)) {
      seenFormatting.add(norm);
      mergedFormatting.push(f);
    }
  }

  const cleanMatched = Array.from(new Set(matchedSkills.filter(Boolean)));
  const cleanMissing = Array.from(
    new Set(missingSkills.filter((s) => !cleanMatched.includes(s))),
  );
  const cleanRecommended = Array.from(
    new Set(
      strArr(
        pick(matrixRaw, "recommended_skills", "recommended", "learn_next") ??
          pick(o, "recommended_skills"),
      ),
    ),
  );

  return {
    candidateName,
    role: str(pick(o, "role", "target_role", "targetRole", "title"), "—"),
    overallScore,
    readinessTier,
    scoreBreakdown: finalBreakdown,
    hrVerdict: str(pick(o, "hr_verdict", "hrVerdict", "verdict", "summary")),
    recruiterFirstImpression: str(
      pick(o, "recruiter_first_impression", "recruiterFirstImpression", "first_impression"),
    ),
    strengths: Array.from(new Set(strArr(pick(o, "strengths", "positives")))).slice(0, 4),
    criticalIssues: dedupedCriticalIssues.slice(0, 10),
    grammarAndOcrErrors: mergedGrammar.slice(0, 12),
    formattingProblems: mergedFormatting.slice(0, 8),
    skillMatrix: {
      matched: cleanMatched,
      missing: cleanMissing,
      recommended: cleanRecommended,
    },
    bulletRewrites: toRewrites(pick(o, "bullet_rewrites", "bulletRewrites", "rewrites")),
    techImprovementIdeas: Array.from(
      new Set(
        strArr(
          pick(o, "tech_improvement_ideas", "techImprovementIdeas", "tech_ideas", "improvement_ideas"),
        ),
      ),
    ).slice(0, 6),
    projectSuggestions: Array.from(
      new Set(strArr(pick(o, "project_suggestions", "projectSuggestions", "projects"))),
    ).slice(0, 3),
    jdScore: finalJdScore,
    jdVerdict: str(pick(jdRaw, "verdict", "recommendation") ?? pick(o, "jd_verdict")),
    manualScore: null,
    officerNotes: "",
    sectionAudits,
    sectionImprovements: toSectionImprovements(
      pick(
        o,
        "section_improvements",
        "sectionImprovements",
        "section_fixes",
        "actionable_improvements",
      ),
    ),
    placementTips: Array.from(
      new Set(strArr(pick(o, "placement_tips", "placementTips", "interview_tips", "tips"))),
    ).slice(0, 5),
    assumedRole: inferredRole,
    evaluationBasis: basis,
    structure: toStructure(pick(o, "structure", "structure_assessment", "document_structure")),
    dataGaps: toDataGaps(
      pick(o, "data_gaps", "dataGaps", "missing_data", "completeness_gaps", "content_gaps"),
    ),
    relevance: toRelevance(
      pick(o, "relevance", "role_relevance", "relevance_verdict"),
      inferredRole,
      basis,
    ),
    roleArc: str(pick(o, "role_arc", "roleArc", "high_level_role")) || inferredRole || "—",
    toolTaxonomy: (() => {
      const t = pick(o, "tool_taxonomy", "toolTaxonomy", "ai_tooling") as
        Record<string, unknown> | string | undefined;
      if (typeof t === "string") {
        return { summary: t, categories: [], hasDomestic: false, hasGlobal: false, tools: [] };
      }
      if (t && typeof t === "object") {
        return {
          summary: str(pick(t as Record<string, unknown>, "summary"), "No GenAI tooling detected"),
          categories: Array.isArray((t as Record<string, unknown>)["categories"])
            ? ((t as Record<string, unknown>)["categories"] as string[])
            : [],
          hasDomestic: Boolean((t as Record<string, unknown>)["hasDomestic"]),
          hasGlobal: Boolean((t as Record<string, unknown>)["hasGlobal"]),
          tools: Array.isArray((t as Record<string, unknown>)["tools"])
            ? ((t as Record<string, unknown>)["tools"] as string[])
            : [],
        };
      }
      return {
        summary: ats?.metrics.toolTaxonomy?.summary ?? "No GenAI tooling detected",
        categories: ats?.metrics.toolTaxonomy?.categories ?? [],
        hasDomestic: ats?.metrics.toolTaxonomy?.hasDomestic ?? false,
        hasGlobal: ats?.metrics.toolTaxonomy?.hasGlobal ?? false,
        tools: ats?.metrics.toolTaxonomy?.hits?.map((h) => h.name) ?? [],
      };
    })(),
    ats,
  };
}

/**
 * Creates an authentic, fully-formed Analysis object from the deterministic ATS engine report alone.
 * Used for zero-AI / rule-based only mode runs with no API token usage.
 */
export function createRuleBasedAnalysis(
  atsReport: AtsReport,
  fileName: string,
  cleanText: string,
  activeJd?: string,
  defaultRole?: string,
): Analysis {
  const inferredName = extractCandidateName(cleanText, fileName);

  const role = activeJd ? "Target JD Role" : defaultRole || "Software Engineer (Entry Level)";
  const basis: "role-fit" | "jd-fit" = activeJd ? "jd-fit" : "role-fit";
  const hasHardBlockers = atsReport.blockers.length > 0;
  // Calibrate rule-based ATS format score: format-only checks without verified AI project architecture reasoning
  // are scaled appropriately so superficial formatting doesn't outscore verified technical candidates.
  const rawRuleScore = atsReport.score;
  const calibratedScore = Math.min(
    74,
    Math.round(rawRuleScore * 0.72 + (atsReport.metrics.skillsFound.length >= 8 ? 8 : 4)),
  );
  const overallScore = hasHardBlockers ? Math.min(58, calibratedScore) : calibratedScore;
  const readinessTier = toTier(undefined, overallScore, hasHardBlockers);

  const finalBreakdown: ScoreRow[] = atsReport.categories.map((c) => ({
    category: c.label,
    score: c.score,
    max: c.max,
    note:
      c.checks
        .filter((k) => !k.passed)
        .map((k) => k.label)
        .join("; ") || "All category criteria met.",
  }));

  const parsed = atsReport.metrics.parsedDocument;
  const projectNames = parsed?.projectEntries.map((p) => p.name).filter(Boolean) ?? [];
  const topSkills = atsReport.metrics.skillsFound.slice(0, 5);

  const recruiterFirstImpression =
    projectNames.length > 0
      ? `Candidate demonstrates applied technical ability with ${projectNames.length} project(s) (${projectNames.slice(0, 2).join(", ")}) utilizing ${topSkills.slice(0, 3).join(", ")}. ${
          atsReport.score >= 75
            ? "Solid foundation ready for technical interview screening."
            : "Requires deeper metric quantification and latency benchmarks to pass competitive screening."
        }`
      : atsReport.score >= 80
        ? `Strong candidate profile with clean formatting and clear competency indicators across core tech stack.`
        : `Promising foundational profile, but requires structured project work and quantified outcomes.`;

  const hrVerdict = atsReport.blockers.length
    ? `Action required on ${atsReport.blockers.length} critical item(s): ${atsReport.blockers.join(" ")} Recommend candidate address these points before placement submission.`
    : atsReport.score >= 75
      ? `Shortlist ready for ${role}. Demonstrates verified stack proficiency with clean layout hygiene.`
      : `Recommend candidate refine bullet metrics in ${projectNames[0] ? `"${projectNames[0]}"` : "projects"} prior to recruiter outreach.`;

  const strengths = atsReport.categories
    .flatMap((c) => c.checks)
    .filter((k) => k.passed && k.points >= 3)
    .slice(0, 3)
    .map((k) => `${k.label}: ${k.detail}`);

  // Dynamic bullet rewrites generated from candidate's actual weak bullets
  const bulletRewrites: Array<{ original: string; rewritten: string; reason: string }> = [];
  if (parsed?.weakVerbBullets && parsed.weakVerbBullets.length > 0) {
    const powerPrefixes = [
      "Architected and deployed",
      "Engineered and optimized",
      "Implemented and benchmarked",
    ];
    let idx = 0;
    for (const weak of parsed.weakVerbBullets.slice(0, 3)) {
      const cleaned = weak
        .replace(/^(i\s+(worked\s+on|helped\s+with|assisted\s+with|was\s+responsible\s+for|handled)\s+|we\s+|helped\s+with\s+|worked\s+on\s+|responsible\s+for\s+|handled\s+|duties\s+included\s+)/i, "")
        .trim();
      const firstLower = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
      const prefix = powerPrefixes[idx % powerPrefixes.length];
      idx++;
      bulletRewrites.push({
        original: weak,
        rewritten: `${prefix} ${firstLower}, optimizing query performance and reducing latency by 35%.`,
        reason: "Replaces passive phrasing with an action-oriented power verb and measurable engineering outcome.",
      });
    }
  }

  const convertAtsCheckToIssue = (k: AtsCheck): Issue => {
    const sev: Severity = k.points === 0 && k.max >= 4 ? "critical" : "major";
    switch (k.id) {
      case "dates":
        return {
          severity: "critical",
          area: "Missing Date Spans",
          problem: "Experience or education entries lack clear date ranges (e.g. 'Aug 2022 – May 2024' or '2023 – Present').",
          evidence: "Single standalone years or undated entries prevent ATS parsers from establishing a career timeline.",
          fix: "Add explicit start and end dates (e.g., '06/2023 – 08/2023') to each internship, project, and educational degree.",
        };
      case "verbs":
        return {
          severity: "major",
          area: "Action Verb Openings",
          problem: `Only ${k.detail.replace(/\.$/, "")}.`,
          evidence: "Multiple bullets start with weak nouns, adjectives, or passive phrasing.",
          fix: "Start every single bullet point with a power action verb (e.g. 'Architected', 'Engineered', 'Optimized', or 'Implemented').",
        };
      case "quantified":
        return {
          severity: "major",
          area: "Quantified Metrics",
          problem: `Bullet points lack measurable metrics or outcomes (${k.detail.replace(/\.$/, "")}).`,
          evidence: "Bullets describe general responsibilities rather than verifiable engineering impact.",
          fix: "Add measurable numbers: e.g., 'Reduced query latency by 35%', 'Scaled to 5,000+ daily users', or 'Built 15+ REST endpoints with 90% test coverage'.",
        };
      case "weak":
        return {
          severity: "major",
          area: "Clichés & Filler",
          problem: `Subjective filler phrases detected (${k.detail.replace(/\.$/, "")}).`,
          evidence: "Generic buzzwords (e.g., 'passionate', 'hardworking') weaken technical credibility.",
          fix: "Delete filler words and replace them with technical stack facts, tools used, and architectural achievements.",
        };
      case "person":
        return {
          severity: "minor",
          area: "First-Person Pronouns",
          problem: `First-person pronouns ('I', 'my', 'me') found in resume text (${k.detail.replace(/\.$/, "")}).`,
          evidence: "Professional resumes use third-person implied-subject phrasing.",
          fix: "Remove 'I' and 'my' (e.g. change 'I created an e-commerce app' to 'Architected full-stack e-commerce platform').",
        };
      case "contact":
      case "email":
      case "phone":
      case "linkedin":
      case "portfolio":
        return {
          severity: "critical",
          area: "Contact & Profile Links",
          problem: `Incomplete contact or portfolio links (${k.detail.replace(/\.$/, "")}).`,
          evidence: "Recruiters and automated screeners require direct links to reach you and inspect your code.",
          fix: "Add your email, mobile phone number, LinkedIn URL, and GitHub profile at the top of your resume.",
        };
      case "req-sections":
        return {
          severity: "critical",
          area: "Missing Standard Sections",
          problem: `Standard ATS sections missing (${k.detail.replace(/\.$/, "")}).`,
          evidence: "Applicant Tracking Systems categorize content by standard section headers.",
          fix: "Add uppercase headings: 'EDUCATION', 'TECHNICAL SKILLS', 'EXPERIENCE', and 'PROJECTS'.",
        };
      case "length":
        return {
          severity: "major",
          area: "Resume Length & Formatting",
          problem: `Resume word count is outside standard target (${k.detail.replace(/\.$/, "")}).`,
          evidence: "Estimated pages: ~" + atsReport.metrics.estimatedPages + " page(s).",
          fix: "Condense bullet points and whitespace to fit a concise, high-impact single-page format (400–750 words).",
        };
      default:
        return {
          severity: sev,
          area: k.label,
          problem: k.detail,
          evidence: `ATS Rule: ${k.label}`,
          fix: `Review and refine ${k.label.toLowerCase()} to align with standard tech industry hiring benchmarks.`,
        };
    }
  };

  const criticalIssues: Issue[] = [
    ...atsReport.blockers.map((b) => ({
      severity: "critical" as Severity,
      area: "ATS Hard Blocker",
      problem: b,
      evidence: "Deterministic parser validation",
      fix: "Format resume content to clear this ATS blocker.",
    })),
    ...atsReport.metrics.sectionsMissing
      .filter((s) => {
        if (s === "Experience / Internships" && atsReport.metrics.sectionsFound.includes("Projects")) {
          return false;
        }
        return true;
      })
      .map((s) => ({
        severity: (s === "Projects" || s === "Education" || s === "Skills" ? "critical" : "major") as Severity,
        area: "Missing Section",
        problem: `Missing '${s}' section in resume.`,
        evidence: `Section header '${s}' not detected`,
        fix: `Add a dedicated '${s}' section with clear technical achievements.`,
      })),
    ...atsReport.categories
      .flatMap((c) => c.checks)
      .filter((k) => !k.passed)
      .slice(0, 3)
      .map(convertAtsCheckToIssue),
  ];

  const grammarAndOcrErrors = (atsReport.metrics.grammarErrorsList ?? []).filter(
    (g) => !isLinkOrEmailPattern(g) && !isCapitalizationOrCasing(g),
  );
  const formattingProblems = atsReport.categories
    .find((c) => c.id === "format")
    ?.checks.filter((k) => !k.passed && k.id !== "grammar")
    .map((k) => k.detail) ?? [];

  const structCat = atsReport.categories.find((c) => c.id === "structure");
  const structScore = structCat ? clamp(Math.round((structCat.score / structCat.max) * 100)) : 75;

  const sectionAudits: SectionAudits = {
    skills: {
      score: clamp(
        Math.round(((atsReport.categories.find((c) => c.id === "skills")?.score ?? 15) / 20) * 25),
        0,
        25,
      ),
      max: 25,
      audit: `Evaluated ${atsReport.metrics.skillsFound.length} technical skills with ${topSkills.length} applied directly in project bullets.`,
      fixTip: "Group skills into Languages, Frameworks, Cloud, and Tooling with explicit versions.",
      matchedKeywords: atsReport.metrics.skillsFound,
      missingCriticalSkills: atsReport.metrics.jdMissing,
    },
    projects: {
      score: atsReport.metrics.bullets > 0 ? 20 : 12,
      max: 25,
      architectureRating: projectNames.length >= 2 ? "Multi-Service Architecture" : "Applied Technical Foundation",
      liveProof: Boolean(
        atsReport.categories.find((c) => c.id === "parse")?.checks.find((k) => k.id === "portfolio")
          ?.passed,
      ),
      audit: projectNames.length > 0
        ? `Evaluated ${projectNames.length} project(s) (${projectNames.slice(0, 2).join(", ")}) with verified tech stack.`
        : "Evaluated project presence and code/portfolio repository links.",
      fixTip: "Include demonstrable metrics and live deployment links.",
    },
    internships: {
      score: atsReport.metrics.sectionsFound.includes("Experience / Internships")
        ? 16
        : atsReport.metrics.sectionsFound.includes("Projects")
          ? 14
          : 8,
      max: 20,
      jdRelevancePct: atsReport.jdScore ?? 75,
      jdRelevanceExplanation: "Calculated keyword coverage from deterministic parser.",
      audit: projectNames.length > 0
        ? `Assessed hands-on technical execution across ${projectNames.slice(0, 2).join(", ")}.`
        : "Evaluated practical projects and experience track record.",
      fixTip: "Quantify responsibilities with measurable business outcomes and STAR format.",
    },
    summary: {
      score: atsReport.metrics.sectionsFound.includes("Summary / Objective") ? 8 : 6,
      max: 10,
      audit: "Evaluated summary section presence and professional framing.",
      fixTip: "Keep summary concise with core tech competencies.",
    },
    certifications: {
      score: atsReport.metrics.sectionsFound.includes("Certifications") ? 8 : 6,
      max: 10,
      audit: "Evaluated accredited certifications and licenses.",
      fixTip: "Include verified certification IDs and vendor accreditations.",
      verifiedCount: atsReport.metrics.sectionsFound.includes("Certifications") ? 1 : 0,
    },
    achievements: {
      score: atsReport.metrics.sectionsFound.includes("Achievements") ? 8 : 6,
      max: 10,
      audit: "Evaluated awards, competitive rankings, and extracurricular honors.",
      fixTip: "Add hackathon wins, LeetCode/Codeforces ratings, or publications.",
    },
  };

  return {
    candidateName: inferredName,
    role,
    overallScore,
    readinessTier,
    scoreBreakdown: finalBreakdown,
    hrVerdict,
    recruiterFirstImpression,
    strengths,
    criticalIssues,
    grammarAndOcrErrors,
    formattingProblems,
    skillMatrix: {
      matched:
        activeJd && atsReport.metrics.jdMatched.length
          ? atsReport.metrics.jdMatched
          : atsReport.metrics.skillsFound,
      missing: activeJd ? atsReport.metrics.jdMissing : [],
      recommended: activeJd
        ? atsReport.metrics.jdMissing.slice(0, 5)
        : getTrackRecommendations(atsReport.metrics.skillsFound, cleanText),
    },
    bulletRewrites,
    techImprovementIdeas:
      activeJd && atsReport.metrics.jdMissing.length
        ? atsReport.metrics.jdMissing.slice(0, 4).map((k) => `Build verifiable project architecture demonstrating ${k}`)
        : [
            "Incorporate measurable latency/throughput metrics in project bullet points",
            "Deploy applications with live demo links and API Swagger documentation",
          ],
    projectSuggestions: atsReport.metrics.sectionsMissing.includes("Projects")
      ? ["Add 2 non-trivial full-stack or systems projects with live URLs."]
      : [],
    jdScore:
      typeof atsReport.jdScore === "number"
        ? atsReport.jdScore
        : Math.max(0, Math.min(100, Math.round(overallScore * 0.88))),
    jdVerdict:
      typeof atsReport.jdScore === "number"
        ? (activeJd && activeJd.trim().length >= 5
            ? `Deterministic keyword coverage: ${atsReport.jdScore}% (${atsReport.metrics.jdMatched.length}/${atsReport.metrics.jdKeywords.length} keywords matched)`
            : `Role competency alignment: ${atsReport.jdScore}% (${atsReport.metrics.skillsFound.length} technical skills identified)`)
        : "Standard role benchmark alignment",
    manualScore: null,
    officerNotes: "",
    sectionAudits,
    sectionImprovements: atsReport.metrics.sectionsMissing.map((s) => ({
      section: s,
      currentGap: `${s} section is missing from resume`,
      actionableFix: `Add a dedicated ${s} section with structured bullet points.`,
    })),
    placementTips: atsReport.blockers.map((b) => `Resolve ATS blocker: ${b}`),
    assumedRole: defaultRole || "Software Engineer (Entry Level)",
    evaluationBasis: basis,
    structure: {
      score: structScore,
      label: structScore >= 80 ? "Excellent" : structScore >= 60 ? "Good" : "Needs work",
      notes: structCat?.checks.map((k) => `${k.label}: ${k.detail}`) ?? [],
    },
    dataGaps: atsReport.metrics.sectionsMissing.map((s) => ({
      area: s,
      missing: `${s} missing`,
      impact: "Reduces ATS parseability and recruiter scannability.",
    })),
    relevance: {
      assumedRole: defaultRole || "Software Engineer (Entry Level)",
      evaluationBasis: basis,
      skillsMisaligned: false,
      verdict: "Evaluated by deterministic ATS engine.",
    },
    roleArc: atsReport.metrics.roleArc,
    toolTaxonomy: {
      summary: atsReport.metrics.toolTaxonomy.summary,
      categories: atsReport.metrics.toolTaxonomy.categories,
      hasDomestic: atsReport.metrics.toolTaxonomy.hasDomestic,
      hasGlobal: atsReport.metrics.toolTaxonomy.hasGlobal,
      tools: atsReport.metrics.toolTaxonomy.hits.map((h) => h.name),
    },
    ats: atsReport,
    isRuleBasedFallback: true,
  };
}

/** Score actually used for ranking — officer override wins. */
export const effectiveScore = (a: Analysis): number => a.manualScore ?? a.overallScore;

export const TIER_ORDER: Record<ReadinessTier, number> = {
  "Tier 1: Shortlist Ready": 1,
  "Tier 2: Needs Minor Polish": 2,
  "Tier 3: Overhaul Required": 3,
};

export function tierTone(tier: string): string {
  if (tier.startsWith("Tier 1")) return "border-success/40 bg-success/10 text-success";
  if (tier.startsWith("Tier 2")) return "border-warning/40 bg-warning/10 text-warning";
  return "border-destructive/40 bg-destructive/10 text-destructive";
}
