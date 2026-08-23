/**
 * Canonical analysis shape + a defensive normalizer.
 *
 * The normalizer is the contract boundary: whatever shape the model returns
 * (snake_case, camelCase, missing keys, strings where numbers belong), the app
 * only ever sees a fully-populated Analysis. This is what stops one bad model
 * response from crashing a 300-resume batch.
 */

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

export type StructureAssessment = {
  /** 0-100: how cleanly a human + an ATS can parse and scan this resume. */
  score: number;
  /** "Excellent" | "Good" | "Needs work" | "Poor" */
  label: string;
  notes: string[];
};

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
            o["idea"],
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

function toTier(v: unknown, score: number): ReadinessTier {
  const s = str(v).toLowerCase();
  if (s.includes("tier 1") || s.includes("shortlist")) return "Tier 1: Shortlist Ready";
  if (s.includes("tier 2") || s.includes("minor")) return "Tier 2: Needs Minor Polish";
  if (s.includes("tier 3") || s.includes("overhaul")) return "Tier 3: Overhaul Required";
  // Derive from the score when the model omitted or mangled the tier.
  if (score >= 75) return "Tier 1: Shortlist Ready";
  if (score >= 55) return "Tier 2: Needs Minor Polish";
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

export function normalizeAnalysis(raw: unknown): Analysis {
  const o = (raw ?? {}) as Record<string, unknown>;
  const matrixRaw = (pick(o, "skill_matrix", "skillMatrix") ?? {}) as Record<string, unknown>;
  const jdRaw = (pick(o, "jd_match", "jdMatch") ?? {}) as Record<string, unknown>;
  const rawJdScore = pick(jdRaw, "score") ?? pick(o, "jd_score", "jdScore");

  const breakdown = arr(pick(o, "score_breakdown", "scoreBreakdown")).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    const max = num(pick(row, "max", "outOf"), 100) || 100;
    // Clamp to [0, max]: models occasionally return a score above the stated max,
    // which would otherwise overflow the progress bars and the PDF chart.
    const score = Math.max(0, Math.min(max, num(pick(row, "score", "value"))));
    return {
      category: str(pick(row, "category", "name"), "Category"),
      score,
      max,
      note: str(pick(row, "note", "comment", "reason")),
    };
  });

  // When a JD is supplied the framing is company-fit; otherwise we fall back to
  // the role the model inferred (or the officer-supplied default role).
  const jdRawObj = (jdRaw ?? {}) as Record<string, unknown>;
  const hasJd =
    rawJdScore !== undefined ||
    (jdRawObj && (Object.keys(jdRawObj).length > 0 || jdRawObj["verdict"] || jdRawObj["score"]));
  const basis: "role-fit" | "jd-fit" = hasJd ? "jd-fit" : "role-fit";

  const jdScoreNum = rawJdScore !== undefined && rawJdScore !== null ? clamp(num(rawJdScore)) : null;
  const sumBreakdown = breakdown.length >= 3 ? breakdown.reduce((acc, b) => acc + b.score, 0) : 0;
  const rawOverall = num(pick(o, "overall_score", "overallScore", "atsScore", "score"));

  const overallScore =
    hasJd && jdScoreNum !== null && jdScoreNum > 0
      ? jdScoreNum
      : rawOverall > 0
        ? clamp(rawOverall)
        : sumBreakdown > 0
          ? clamp(sumBreakdown)
          : 75;
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

  return {
    candidateName: str(pick(o, "candidate_name", "candidateName", "name"), "Unnamed candidate"),
    role: str(pick(o, "role", "target_role", "targetRole", "title"), "—"),
    overallScore,
    readinessTier: toTier(pick(o, "readiness_tier", "readinessTier", "tier"), overallScore),
    scoreBreakdown: breakdown,
    hrVerdict: str(pick(o, "hr_verdict", "hrVerdict", "verdict", "summary")),
    recruiterFirstImpression: str(
      pick(o, "recruiter_first_impression", "recruiterFirstImpression", "first_impression"),
    ),
    strengths: strArr(pick(o, "strengths", "positives")),
    criticalIssues: toIssues(pick(o, "critical_issues", "criticalIssues", "issues")),
    grammarAndOcrErrors: strArr(
      pick(o, "grammar_and_ocr_errors", "grammarAndOcrErrors", "grammar_errors"),
    ),
    formattingProblems: strArr(
      pick(o, "formatting_problems", "formattingProblems", "formatting_issues"),
    ),
    skillMatrix: {
      matched: strArr(
        pick(matrixRaw, "matched_skills", "matched", "present") ?? pick(o, "matched_skills"),
      ),
      missing: strArr(
        pick(matrixRaw, "missing_skills", "missing", "gaps") ??
          pick(o, "missing_skills", "missingKeywords"),
      ),
      recommended: strArr(
        pick(matrixRaw, "recommended_skills", "recommended", "learn_next") ??
          pick(o, "recommended_skills"),
      ),
    },
    bulletRewrites: toRewrites(pick(o, "bullet_rewrites", "bulletRewrites", "rewrites")),
    techImprovementIdeas: strArr(
      pick(o, "tech_improvement_ideas", "techImprovementIdeas", "tech_ideas", "improvement_ideas"),
    ),
    projectSuggestions: strArr(pick(o, "project_suggestions", "projectSuggestions", "projects")),
    jdScore: rawJdScore === undefined || rawJdScore === null ? null : clamp(num(rawJdScore)),
    jdVerdict: str(pick(jdRaw, "verdict", "recommendation") ?? pick(o, "jd_verdict")),
    manualScore: null,
    officerNotes: "",
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
