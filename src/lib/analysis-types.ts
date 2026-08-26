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

function toSectionAudits(v: unknown, breakdown: ScoreRow[]): SectionAudits {
  const o = (v ?? {}) as Record<string, unknown>;
  const sumRaw = (pick(o, "summary", "summary_audit", "professional_summary") ?? {}) as Record<string, unknown>;
  const sklRaw = (pick(o, "skills", "skills_audit", "technical_skills_audit", "technical_skills") ?? {}) as Record<string, unknown>;
  const prjRaw = (pick(o, "projects", "projects_audit", "project_work") ?? {}) as Record<string, unknown>;
  const expRaw = (pick(o, "internships", "internship_experience_audit", "internship_experience", "internships_audit", "experience") ?? {}) as Record<string, unknown>;
  const cerRaw = (pick(o, "certifications", "certifications_audit", "accreditations") ?? {}) as Record<string, unknown>;
  const achRaw = (pick(o, "achievements", "achievements_audit", "awards") ?? {}) as Record<string, unknown>;

  const findScore = (key: string, defScore: number, maxVal: number) => {
    const row = breakdown.find((b) => b.category.toLowerCase().includes(key));
    if (row) return Math.min(maxVal, Math.round((row.score / (row.max || 100)) * maxVal));
    return defScore;
  };

  return {
    summary: {
      score: clamp(num(pick(sumRaw, "score"), findScore("summary", 8, 10)), 0, 10),
      max: 10,
      audit: str(pick(sumRaw, "audit", "critique", "assessment"), "Evaluated for professional clarity, career alignment, and concise technical impact."),
      fixTip: str(pick(sumRaw, "fix_tip", "fixTip", "tip", "recommendation"), "Lead with technical domain focus, total projects/internships built, and core modern stack."),
    },
    skills: {
      score: clamp(num(pick(sklRaw, "score"), findScore("skills", 20, 25)), 0, 25),
      max: 25,
      audit: str(pick(sklRaw, "audit", "critique", "assessment"), "Evaluated depth of modern frameworks, programming languages, database systems, and developer tooling."),
      fixTip: str(pick(sklRaw, "fix_tip", "fixTip", "tip", "recommendation"), "Categorize skills cleanly by Languages, Backend, Frontend, Cloud & Databases with explicit versions."),
      matchedKeywords: strArr(pick(sklRaw, "matched_keywords", "matchedKeywords", "matched")),
      missingCriticalSkills: strArr(pick(sklRaw, "missing_critical_skills", "missingCriticalSkills", "missing")),
    },
    projects: {
      score: clamp(num(pick(prjRaw, "score"), findScore("project", 20, 25)), 0, 25),
      max: 25,
      audit: str(pick(prjRaw, "audit", "critique", "assessment"), "Evaluated project architecture complexity, API integrations, data modeling, and verifiable deployments."),
      fixTip: str(pick(prjRaw, "fix_tip", "fixTip", "tip", "recommendation"), "Detail backend architecture, schema design, latency metrics, and verifiable GitHub / live demo links."),
      architectureRating: str(pick(prjRaw, "architecture_rating", "architectureRating", "complexity"), "Production Architecture"),
      liveProof: Boolean(pick(prjRaw, "live_proof", "liveProof", "has_links", "verifiable")),
    },
    internships: {
      score: clamp(num(pick(expRaw, "score"), findScore("internship", 16, 20)), 0, 20),
      max: 20,
      jdRelevancePct: clamp(num(pick(expRaw, "jd_relevance_pct", "jdRelevancePct", "relevance_pct", "relevance"), 80), 0, 100),
      jdRelevanceExplanation: str(pick(expRaw, "jd_relevance_explanation", "jdRelevanceExplanation", "relevance_explanation"), "Assessed direct mapping between practical responsibilities and target job requirements."),
      audit: str(pick(expRaw, "audit", "critique", "assessment"), "Evaluated hands-on production code contributions, quantifiable business impact, and workflow ownership."),
      fixTip: str(pick(expRaw, "fix_tip", "fixTip", "tip", "recommendation"), "Structure bullets with STAR method (Situation, Task, Action, Measurable Metric Outcome)."),
    },
    certifications: {
      score: clamp(num(pick(cerRaw, "score"), findScore("cert", 8, 10)), 0, 10),
      max: 10,
      audit: str(pick(cerRaw, "audit", "critique", "assessment"), "Evaluated verifiable vendor/cloud accreditations (AWS, GCP, Azure, Oracle, Cisco, Kubernetes)."),
      fixTip: str(pick(cerRaw, "fix_tip", "fixTip", "tip", "recommendation"), "Include verifiable credential IDs, issue dates, and credential links for verified cloud certifications."),
      verifiedCount: clamp(num(pick(cerRaw, "verified_count", "verifiedCount", "count"), 1), 0, 10),
    },
    achievements: {
      score: clamp(num(pick(achRaw, "score"), findScore("achieve", 8, 10)), 0, 10),
      max: 10,
      audit: str(pick(achRaw, "audit", "critique", "assessment"), "Evaluated hackathons, competitive programming ranks, tech awards, open-source PRs, and verifiable proof."),
      fixTip: str(pick(achRaw, "fix_tip", "fixTip", "tip", "recommendation"), "Highlight competitive ratings (LeetCode, Codeforces), hackathon podium placements, and open source contributions."),
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
        actionableFix: str(pick(o, "actionable_fix", "actionableFix", "fix", "solution", "tip", "action")),
      };
    })
    .filter((s) => s.currentGap || s.actionableFix);
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
  const explicitOverall = pick(o, "overall_score", "overallScore", "atsScore", "score");
  const overallScore =
    explicitOverall !== undefined
      ? clamp(num(explicitOverall))
      : sumBreakdown > 0
        ? clamp(sumBreakdown)
        : jdScoreNum !== null
          ? jdScoreNum
          : 0;
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

  // If score breakdown was provided, keep it; otherwise synthesize from section audits
  const finalBreakdown: ScoreRow[] =
    breakdown.length > 0
      ? breakdown
      : [
          { category: "Technical Skills Depth & Stack", score: sectionAudits.skills.score, max: 25, note: sectionAudits.skills.audit },
          { category: "Project Complexity & Architecture", score: sectionAudits.projects.score, max: 25, note: sectionAudits.projects.audit },
          { category: "Internships & Practical Track Record (JD-Aligned)", score: sectionAudits.internships.score, max: 20, note: sectionAudits.internships.audit },
          { category: "Professional Summary & Career Positioning", score: sectionAudits.summary.score, max: 10, note: sectionAudits.summary.audit },
          { category: "Verified Certifications & Accreditations", score: sectionAudits.certifications.score, max: 10, note: sectionAudits.certifications.audit },
          { category: "Achievements, Hackathons & Verifiable Proof", score: sectionAudits.achievements.score, max: 10, note: sectionAudits.achievements.audit },
        ];

  const matchedSkills = strArr(
    pick(matrixRaw, "matched_skills", "matched_keywords", "matched", "present") ??
      pick(o, "matched_skills", "matched_keywords"),
  );
  const missingSkills = strArr(
    pick(matrixRaw, "missing_skills", "missing_critical_skills", "missing", "gaps") ??
      pick(o, "missing_skills", "missingKeywords", "missing_critical_skills"),
  );

  return {
    candidateName: str(pick(o, "candidate_name", "candidateName", "name"), "Unnamed candidate"),
    role: str(pick(o, "role", "target_role", "targetRole", "title"), "—"),
    overallScore,
    readinessTier: toTier(pick(o, "readiness_tier", "readinessTier", "tier"), overallScore),
    scoreBreakdown: finalBreakdown,
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
      matched: matchedSkills.length ? matchedSkills : sectionAudits.skills.matchedKeywords,
      missing: missingSkills.length ? missingSkills : sectionAudits.skills.missingCriticalSkills,
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
    sectionAudits,
    sectionImprovements: toSectionImprovements(pick(o, "section_improvements", "sectionImprovements", "section_fixes", "actionable_improvements")),
    placementTips: strArr(pick(o, "placement_tips", "placementTips", "interview_tips", "tips")),
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
