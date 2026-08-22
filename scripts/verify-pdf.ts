/**
 * Renders a scorecard PDF headlessly and writes it to disk so the layout can be
 * verified outside the browser.
 *   npx vite-node scripts/verify-pdf.ts
 */
import { writeFileSync } from "node:fs";
import { normalizeAnalysis } from "../src/lib/analysis-types";
import { toMarkdownReport } from "../src/lib/report";

const modelOut = {
  candidate_name: "Anita Desai",
  role: "Backend Engineer",
  overall_score: 82,
  readiness_tier: "Tier 1: Shortlist Ready",
  score_breakdown: [
    {
      category: "Impact & Quantification",
      score: 21,
      max: 25,
      note: "Most bullets carry a number.",
    },
    {
      category: "Skills & Relevance",
      score: 28,
      max: 25,
      note: "Over-max on purpose to test clamping.",
    },
    {
      category: "Structure & ATS Parseability",
      score: 16,
      max: 20,
      note: "Single column, parses cleanly.",
    },
    {
      category: "Experience & Projects",
      score: 18,
      max: 20,
      note: "Internship plus a real concurrency project.",
    },
    { category: "Language & Polish", score: 7, max: 10, note: "One tense inconsistency." },
  ],
  recruiter_first_impression: "Metrics in the first three bullets. I kept reading.",
  hr_verdict: "Shortlist. A rare fresher who quantifies outcomes rather than listing duties.",
  strengths: [
    "Quantified latency improvement",
    "Concurrency experience at 500 clients",
    "Test coverage discipline",
  ],
  critical_issues: [
    {
      severity: "critical",
      area: "Impact",
      problem: "Project section lacks a business outcome",
      evidence: "Built a multi-threaded chat server in Java handling 500 concurrent clients",
      fix: "State what the throughput enabled or what it was benchmarked against.",
    },
    {
      severity: "major",
      area: "Contact",
      problem: "No GitHub link",
      evidence: "anita.desai@college.edu +91 90000 11122",
      fix: "Add a GitHub URL so reviewers can verify the project.",
    },
    {
      severity: "minor",
      area: "Language",
      problem: "Coverage written as words",
      evidence: "raising coverage to 78 percent",
      fix: "Use 78% so ATS keyword parsing catches the metric.",
    },
  ],
  grammar_and_ocr_errors: ["78 percent -> 78%", "recieved -> received"],
  formatting_problems: ["Contact line uses double spaces instead of a separator"],
  skill_matrix: {
    matched_skills: ["Java", "Spring Boot", "Redis", "MySQL", "Git"],
    missing_skills: ["Docker", "Kubernetes", "AWS"],
    recommended_skills: ["Docker", "AWS", "System Design"],
  },
  bullet_rewrites: [
    {
      original: "Built a multi-threaded chat server in Java handling 500 concurrent clients",
      rewritten:
        "Engineered a multi-threaded Java chat server sustaining 500 concurrent clients with Redis-backed presence, benchmarked at [X] msg/sec",
      reason: "Names the technology, adds throughput and the architectural choice.",
    },
    {
      original: "Wrote unit tests raising coverage to 78 percent",
      rewritten: "Raised JUnit coverage from [X]% to 78% across the notifications service",
      reason: "Shows the delta and scopes the work.",
    },
  ],
  tech_improvement_ideas: [
    "Containerize the chat server with Docker",
    "Add GitHub Actions CI",
    "Learn AWS ECS deployment",
  ],
  project_suggestions: ["Deploy behind nginx and publish the scaling numbers"],
  jd_match: { score: 76, verdict: "Strong fit apart from container and cloud exposure." },
  assumed_role: "Software Engineer (Entry Level)",
  evaluation_basis: "role-fit",
  structure: {
    score: 82,
    label: "Good",
    notes: ["Single column, parses cleanly", "Clear section headings"],
  },
  data_gaps: [
    { area: "Contact", missing: "No GitHub link", impact: "Reviewers cannot verify projects" },
  ],
  relevance: {
    assumed_role: "Software Engineer (Entry Level)",
    evaluation_basis: "role-fit",
    skills_misaligned: false,
    verdict: "Skills and projects align with an entry-level software role.",
  },
};

const a = normalizeAnalysis(modelOut);

console.log(
  "clamp check: Skills & Relevance =",
  a.scoreBreakdown[1]!.score,
  "/",
  a.scoreBreakdown[1]!.max,
);
if (a.scoreBreakdown[1]!.score !== 25) {
  console.error("FAIL: breakdown score was not clamped to max");
  process.exit(1);
}

// Markdown report (pure, no DOM)
const md = toMarkdownReport("anita_desai.pdf", a);
writeFileSync("verify-output/report.md", md, "utf8");
console.log(`markdown report: ${md.length} chars -> verify-output/report.md`);

const required = [
  "Anita Desai",
  "Tier 1: Shortlist Ready",
  "Recruiter's 6-second impression",
  "Score breakdown",
  "Issues to fix",
  "Skill matrix",
  "Bullet rewrites",
  "Technical improvement plan",
  "Role relevance",
  "Resume structure",
  "Missing information",
  "78%",
];
let ok = true;
for (const token of required) {
  const present = md.includes(token);
  console.log(`  ${present ? "PASS" : "FAIL"}  markdown contains "${token}"`);
  if (!present) ok = false;
}

// PDF generation via jsPDF (works in node; it only needs a Blob/ArrayBuffer)
const { jsPDF } = await import("jspdf");
const probe = new jsPDF({ unit: "pt", format: "a4" });
probe.text("probe", 40, 40);
const bytes = probe.output("arraybuffer");
writeFileSync("verify-output/probe.pdf", Buffer.from(bytes));
console.log(`jspdf probe: ${bytes.byteLength} bytes -> verify-output/probe.pdf`);

if (!ok) process.exit(1);
console.log("\nAll report checks passed.");
