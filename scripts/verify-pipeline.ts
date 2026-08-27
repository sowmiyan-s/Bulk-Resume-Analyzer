/**
 * Pipeline verification: sanitizer + JSON recovery + normalizer.
 * Run with:  npx vite-node scripts/verify-pipeline.ts
 */
import { sanitizeResumeText, capForPrompt } from "../src/lib/sanitize";
import { extractJson } from "../src/lib/llm";
import { normalizeAnalysis, effectiveScore } from "../src/lib/analysis-types";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

console.log("\n=== 1. SANITIZER (OCR glitch repair) ===");
const dirty = [
  "J0HN  D0E   \u2022 Sr. Deve1oper",
  "Email:  john\uFB01n@test.com   |  Phone : +91 98765 43210",
  "o Built a  micr0service  handling 1O0% more traffic in 2O24",
  "\u2022 Led  engi-",
  "neering  team  of 5",
  "Skills : Pyth0n , 5QL , React\uFEFF",
  "",
  "",
  "",
  "Achieved 40% cost reduction and 2024 revenue of $1.5M",
].join("\n");

const s = sanitizeResumeText(dirty);
console.log("--- cleaned output ---");
console.log(s.clean);
console.log("--- fixes ---");
s.fixes.forEach((f) => console.log(`  ${f.kind} x${f.count}`));
console.log("--- warnings ---");
s.warnings.forEach((w) => console.log(`  ! ${w}`));

check(
  "0->O in name (J0HN->JOHN not required, but Pyth0n->Python)",
  s.clean.includes("Python"),
  s.clean,
);
check("5QL -> SQL", s.clean.includes("SQL"));
check("Deve1oper -> Developer", s.clean.includes("Developer"));
check("ligature fi fixed", s.clean.includes("johnfin@test.com"));
check("hyphen line-wrap joined", s.clean.includes("engineering"));
check("1O0% -> 100%", s.clean.includes("100%"), s.clean);
check("2O24 -> 2024", s.clean.includes("2024"));
check("REAL metric 40% preserved", s.clean.includes("40%"));
check("REAL year 2024 preserved", s.clean.includes("2024 revenue"));
check("$1.5M preserved", s.clean.includes("$1.5M"));
check("broken 'o ' bullet -> '* '", /\* Built a/.test(s.clean), s.clean);
check("space-before-punct fixed", s.clean.includes("Phone:") && s.clean.includes("Skills:"));
check("blank line runs collapsed", !/\n{3,}/.test(s.clean));
check("zero-width char stripped", !/\uFEFF/.test(s.clean));
check("email detected (no warning)", !s.warnings.some((w) => w.includes("email")));
check("phone detected (no warning)", !s.warnings.some((w) => w.includes("phone")));
check("chars saved", s.stats.savedChars > 0, `saved=${s.stats.savedChars}`);

console.log("\n=== 1b. WORD-INITIAL digit glitches (regression) ===");
const wordStart = sanitizeResumeText(
  [
    "o 0ptimized database queries",
    "o 1eadership of a 5ystem design team",
    "Managed 5 engineers over 10 months for 0.5 FTE",
    "Scored 100% on 3 of 4 modules",
    "Version 2 released in 2024",
  ].join("\n"),
);
console.log(wordStart.clean);
check("0ptimized -> Optimized", wordStart.clean.includes("Optimized"), wordStart.clean);
check("1eadership -> leadership", wordStart.clean.includes("leadership"));
check("5ystem -> System", wordStart.clean.includes("System"));
check("real '5 engineers' preserved", wordStart.clean.includes("5 engineers"));
check("real '10 months' preserved", wordStart.clean.includes("10 months"));
check("real '0.5 FTE' preserved", wordStart.clean.includes("0.5 FTE"));
check("real '100%' preserved", wordStart.clean.includes("100%"));
check("real '3 of 4' preserved", wordStart.clean.includes("3 of 4"));
check("real 'Version 2' preserved", wordStart.clean.includes("Version 2"));
check("real '2024' preserved", wordStart.clean.includes("2024"));
check(
  "revealed 'o' bullet normalized after digit fix",
  wordStart.clean.includes("* Optimized"),
  wordStart.clean,
);

console.log("\n=== 2. capForPrompt (token control) ===");
const long = "x".repeat(30000);
const capped = capForPrompt(long, 9000);
check("caps to <= 9000+marker", capped.length <= 9100, `len=${capped.length}`);
check("keeps head and tail", capped.startsWith("x") && capped.endsWith("x"));
check("marks the trim", capped.includes("trimmed for length"));
check("short text untouched", capForPrompt("short", 9000) === "short");

console.log("\n=== 3. JSON RECOVERY (model output tolerance) ===");
const variants: Array<[string, string]> = [
  ["plain", '{"overall_score":72}'],
  ["fenced", '```json\n{"overall_score":72}\n```'],
  ["think block", '<think>let me reason...</think>\n{"overall_score":72}'],
  ["prose before", 'Here is the analysis:\n{"overall_score":72}'],
  ["prose after", '{"overall_score":72}\nHope that helps!'],
  ["trailing comma", '{"overall_score":72,}'],
  ["nested braces + string braces", '{"overall_score":72,"note":"use {curly} braces","o":{"a":1}}'],
];
for (const [label, raw] of variants) {
  try {
    const parsed = extractJson(raw) as Record<string, unknown>;
    check(`recovers: ${label}`, parsed["overall_score"] === 72, JSON.stringify(parsed));
  } catch (e) {
    check(`recovers: ${label}`, false, String(e));
  }
}
try {
  extractJson("no json at all here");
  check("rejects non-JSON", false);
} catch {
  check("rejects non-JSON", true);
}

console.log("\n=== 4. NORMALIZER (snake_case model output) ===");
const modelOut = {
  candidate_name: "Priya Sharma",
  role: "Backend Engineer",
  overall_score: "68",
  readiness_tier: "Tier 2: Needs Minor Polish",
  score_breakdown: [
    { category: "Impact & Quantification", score: 12, max: 25, note: "few metrics" },
    { category: "Skills & Relevance", score: 18, max: 25, note: "good stack" },
  ],
  recruiter_first_impression: "Dense wall of text, no metrics in the top third.",
  hr_verdict: "Borderline. Would shortlist only if the project section is rewritten.",
  strengths: ["Strong Java fundamentals", { text: "Real internship experience" }],
  critical_issues: [
    {
      severity: "CRITICAL",
      area: "Impact",
      problem: "No quantified results",
      evidence: "Worked on backend",
      fix: "Add metrics",
    },
    "Formatting is inconsistent",
  ],
  grammar_and_ocr_errors: ["recieved -> received", "0ptimized -> Optimized"],
  formatting_problems: ["Two-column layout breaks ATS parsing"],
  skill_matrix: {
    matched_skills: ["Java", "Spring Boot"],
    missing_skills: ["Docker", "Kubernetes"],
    recommended_skills: ["Docker", "AWS"],
  },
  bullet_rewrites: [
    {
      original: "Worked on backend",
      rewritten: "Built 12 REST endpoints cutting latency [X]%",
      reason: "adds action verb + metric",
    },
  ],
  tech_improvement_ideas: ["Learn Docker", "Add CI/CD"],
  project_suggestions: ["Build a rate-limited API gateway"],
  jd_match: { score: 61, verdict: "Partial fit" },
};

const a = normalizeAnalysis(modelOut);
check("name", a.candidateName === "Priya Sharma");
check("score coerced from string", a.overallScore === 68, String(a.overallScore));
check("tier preserved", a.readinessTier === "Tier 2: Needs Minor Polish");
check("breakdown rows", a.scoreBreakdown.length === 2);
check(
  "strengths flattens objects",
  a.strengths.length === 2 && a.strengths[1] === "Real internship experience",
);
check("issue severity normalized", a.criticalIssues[0]!.severity === "critical");
check("bare-string issue absorbed", a.criticalIssues[1]!.problem === "Formatting is inconsistent");
check("skill matrix matched", a.skillMatrix.matched.join() === "Java,Spring Boot");
check("skill matrix missing", a.skillMatrix.missing.join() === "Docker,Kubernetes");
check(
  "bullet rewrites",
  a.bulletRewrites.length === 1 && a.bulletRewrites[0]!.rewritten.includes("REST"),
);
check("tech ideas", a.techImprovementIdeas.length === 2);
check("jd score", a.jdScore === 61);
check("manualScore starts null", a.manualScore === null);
check("effectiveScore uses AI score", effectiveScore(a) === 68);
check("effectiveScore respects override", effectiveScore({ ...a, manualScore: 90 }) === 90);

console.log("\n=== 5b. NEW FIELDS (v2: clarity/role-relevance) ===");
const rich = normalizeAnalysis({
  ...modelOut,
  assumed_role: "Software Engineer (Entry Level)",
  evaluation_basis: "jd-fit",
  structure: { score: 78, label: "Good", notes: ["Clear sectioning", "One column"] },
  data_gaps: [
    { area: "Impact", missing: "No quantified outcomes", impact: "Looks like a duty list" },
  ],
  relevance: {
    assumed_role: "Software Engineer (Entry Level)",
    evaluation_basis: "role-fit",
    skills_misaligned: false,
    verdict: "Skills and projects line up with the role.",
  },
});
check("assumedRole carried", rich.assumedRole === "Software Engineer (Entry Level)");
check("evaluationBasis jd-fit (jd_match present)", rich.evaluationBasis === "jd-fit");
check("structure score", rich.structure.score === 78 && rich.structure.label === "Good");
check("dataGaps parsed", rich.dataGaps.length === 1 && rich.dataGaps[0]!.area === "Impact");
check("relevance parsed", rich.relevance.verdict.includes("line up"));

console.log("===== 5c. NORMALIZER default-fills new fields when absent =====");
const bare = normalizeAnalysis({ overall_score: 70 });
check("structure defaults to {}", bare.structure.score === 0);
check("dataGaps defaults []", Array.isArray(bare.dataGaps));
check("relevance defaults basis role-fit", bare.relevance.evaluationBasis === "role-fit");
check("assumedRole defaults —", bare.assumedRole === "—");

console.log("\n=== 5. NORMALIZER RESILIENCE (garbage in) ===");
const empty = normalizeAnalysis({});
check("empty object -> no crash", empty.candidateName === "Unnamed candidate");
check("empty -> score 0", empty.overallScore === 0);
check("empty -> tier derived Tier 3", empty.readinessTier === "Tier 3: Overhaul Required");
check(
  "empty -> arrays not null",
  Array.isArray(empty.criticalIssues) && Array.isArray(empty.strengths),
);
check("empty -> skillMatrix shape intact", Array.isArray(empty.skillMatrix.missing));
check("null -> no crash", normalizeAnalysis(null).candidateName === "Unnamed candidate");
check("string -> no crash", normalizeAnalysis("garbage").overallScore === 0);
check("camelCase also works", normalizeAnalysis({ overallScore: 88 }).overallScore === 88);
check("atsScore legacy key works", normalizeAnalysis({ atsScore: 55 }).overallScore === 55);
check(
  "tier derived from high score",
  normalizeAnalysis({ overall_score: 80 }).readinessTier.startsWith("Tier 1"),
);
check("score clamped >100", normalizeAnalysis({ overall_score: 250 }).overallScore === 100);
check("score clamped <0", normalizeAnalysis({ overall_score: -5 }).overallScore === 0);
check(
  "breakdown score clamped to max",
  normalizeAnalysis({ score_breakdown: [{ category: "X", score: 28, max: 25 }] }).scoreBreakdown[0]!
    .score === 25,
);
check(
  "breakdown score clamped at 0",
  normalizeAnalysis({ score_breakdown: [{ category: "X", score: -3, max: 25 }] }).scoreBreakdown[0]!
    .score === 0,
);

console.log("\n=== 6. ATS ENGINE (Deterministic Parser & Rules) ===");
import { runAtsEngine, atsFactSheet } from "../src/lib/ats-engine";
import { buildMessages } from "../src/lib/llm";
import { createRuleBasedAnalysis } from "../src/lib/analysis-types";

const sampleResume = `
Johnathan Doe
Email: john.doe@example.com | Phone: +1 555-123-4567 | LinkedIn: linkedin.com/in/johndoe | GitHub: github.com/johndoe

Summary
Full-stack software engineer with 2+ years of experience in distributed systems and cloud applications.

Technical Skills
Languages: Python, TypeScript, Java, C++, Go, SQL
Frameworks: React, Next.js, Node.js, FastAPI, Spring Boot, Tailwind
Databases & Cloud: PostgreSQL, MongoDB, Redis, Docker, Kubernetes, AWS, Terraform, CI/CD, Git

Experience
Software Engineer Intern - Acme Corp (June 2023 - August 2024)
- Architected and deployed microservices using FastAPI and Docker, reducing API latency by 35% across 2M daily requests.
- Engineered real-time data streaming pipeline with Kafka and Redis, boosting throughput by 40%.
- Automated CI/CD deployment pipelines using GitHub Actions, cutting release deployment cycle times from 45 mins to 8 mins.

Projects
Distributed Task Queue (github.com/johndoe/task-queue)
- Designed an asynchronous distributed task processor in Go and PostgreSQL handling 50k concurrent jobs.
- Implemented rate limiting and retry backoff algorithms, decreasing job failure rates by 28%.

Education
B.S. in Computer Science - State University (2020 - 2024)
`;

const sampleJd = `
Looking for a Software Engineer with experience in Python, FastAPI, Docker, Kubernetes, PostgreSQL, AWS, and CI/CD pipelines.
Experience with distributed systems and performance optimization required.
`;

const atsReportNoJd = runAtsEngine(sampleResume);
check("ATS score computed (no JD)", atsReportNoJd.score > 70, `score=${atsReportNoJd.score}`);
check("ATS jdScore is null without JD", atsReportNoJd.jdScore === null);
check("All 5 categories present", atsReportNoJd.categories.length === 5);
check("Email check passed", atsReportNoJd.categories[0]!.checks.some((c) => c.id === "email" && c.passed));
check("Phone check passed", atsReportNoJd.categories[0]!.checks.some((c) => c.id === "phone" && c.passed));
check("Recognized skills detected", atsReportNoJd.metrics.skillsFound.length >= 10);
check("Quantified bullets detected", atsReportNoJd.metrics.quantifiedBullets >= 3);
check("No hard blockers on clean resume", atsReportNoJd.blockers.length === 0);

const atsReportWithJd = runAtsEngine(sampleResume, sampleJd);
check("ATS jdScore computed with JD", atsReportWithJd.jdScore !== null && atsReportWithJd.jdScore >= 70, `jdScore=${atsReportWithJd.jdScore}`);
check("Matched JD keywords found", atsReportWithJd.metrics.jdMatched.includes("python") && atsReportWithJd.metrics.jdMatched.includes("docker"));

console.log("\n=== 7. ATS FACT SHEET & LLM MESSAGES ===");
const factSheet = atsFactSheet(atsReportWithJd);
check("Fact sheet generated", factSheet.includes("DETERMINISTIC ATS ENGINE RESULT"));
check("Fact sheet has score", factSheet.includes(`real_ats_score=${atsReportWithJd.score}/100`));
check("Fact sheet has metrics", factSheet.includes("metrics: words="));

const messages = buildMessages({
  fileName: "john_doe_resume.pdf",
  resumeText: sampleResume,
  jobDescription: sampleJd,
  atsFacts: factSheet,
});
check("buildMessages includes ATS facts in user prompt", messages[1]!.content.includes("DETERMINISTIC ATS ENGINE RESULT"));
check("buildMessages includes resume text", messages[1]!.content.includes("Distributed Task Queue"));

console.log("\n=== 8. NORMALIZER ATS BLENDING & RULE-BASED ANALYSIS ===");
const blendedAnalysis = normalizeAnalysis(
  {
    overall_score: 90,
    jd_score: 50,
  },
  atsReportWithJd,
);
check("Analysis has ats report attached", blendedAnalysis.ats !== null);
check("jdScore overridden with engine keyword match", blendedAnalysis.jdScore === atsReportWithJd.jdScore);
check("overallScore blended 70/30 with engine score", blendedAnalysis.overallScore === Math.round(atsReportWithJd.score * 0.7 + 90 * 0.3));

const ruleBased = createRuleBasedAnalysis(
  atsReportWithJd,
  "john_doe_resume.pdf",
  sampleResume,
  sampleJd,
  "Software Engineer (Entry Level)",
);
check("Rule-based analysis candidateName inferred", ruleBased.candidateName.includes("Johnathan"));
check("Rule-based score matches engine", ruleBased.overallScore === atsReportWithJd.score);
check("Rule-based jdScore matches engine", ruleBased.jdScore === atsReportWithJd.jdScore);
check("Rule-based scoreBreakdown has 5 rows", ruleBased.scoreBreakdown.length === 5);
check("Rule-based skillMatrix populated", ruleBased.skillMatrix.matched.length > 5);
check("Rule-based evaluationBasis is jd-fit", ruleBased.evaluationBasis === "jd-fit");

console.log(`\n===== ${pass} passed, ${fail} failed =====\n`);
if (fail > 0) process.exit(1);

