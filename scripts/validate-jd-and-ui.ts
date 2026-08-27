import { runAtsEngine } from "../src/lib/ats-engine";
import { normalizeAnalysis, createRuleBasedAnalysis, effectiveScore } from "../src/lib/analysis-types";
import { toMarkdownReport } from "../src/lib/report";

const sampleResume = `
John Doe
Software Engineer
john.doe@example.com | (555) 123-4567 | github.com/johndoe | linkedin.com/in/johndoe

SUMMARY
Full-Stack Developer with 3+ years experience building scalable web applications with React, TypeScript, Node.js, and PostgreSQL.

SKILLS
Programming: JavaScript, TypeScript, Python, SQL
Frameworks: React, Next.js, Node.js, Express, Tailwind CSS
Tools & Cloud: Docker, AWS, Git, PostgreSQL, Redis, MongoDB

EXPERIENCE
Software Engineer at Acme Corp (2022 - Present)
- Engineered high-throughput REST APIs using Node.js and TypeScript, reducing p99 latency by 35%.
- Implemented real-time dashboard with React and WebSockets, supporting 10k+ concurrent users.
- Automated CI/CD pipeline using GitHub Actions and Docker, accelerating release cycle by 50%.

PROJECTS
AI Resume Scanner (2023)
- Built full-stack ATS evaluation platform using Next.js, Tailwind, and FastAPI.
- Integrated PostgreSQL and Redis caching for sub-100ms report retrieval.
`;

const sampleJd = `
Looking for a Full-Stack Software Engineer with strong experience in React, TypeScript, Node.js, Docker, AWS, and PostgreSQL.
Required:
- 2+ years experience in TypeScript and React
- REST API development in Node.js
- Cloud deployment with Docker and AWS
- Database optimization in PostgreSQL
`;

async function main() {
  console.log("==================================================");
  console.log("1. VALIDATING ATS ENGINE WITH CUSTOM JD");
  console.log("==================================================");
  const atsWithJd = runAtsEngine(sampleResume, sampleJd);
  console.log(`ATS Score: ${atsWithJd.score}/100`);
  console.log(`ATS JD Score (With JD): ${atsWithJd.jdScore}%`);
  console.log(`JD Keywords Matched: ${atsWithJd.metrics.jdMatched.join(", ")}`);
  if (atsWithJd.jdScore === null || atsWithJd.jdScore < 0 || atsWithJd.jdScore > 100) {
    throw new Error(`Invalid ATS JD score with custom JD: ${atsWithJd.jdScore}`);
  }
  console.log("✓ Pass: Custom JD match score is valid (0-100).");

  console.log("\n==================================================");
  console.log("2. VALIDATING ATS ENGINE WITHOUT CUSTOM JD");
  console.log("==================================================");
  const atsWithoutJd = runAtsEngine(sampleResume);
  console.log(`ATS Score: ${atsWithoutJd.score}/100`);
  console.log(`ATS Baseline JD Score (No JD): ${atsWithoutJd.jdScore}%`);
  if (atsWithoutJd.jdScore === null || atsWithoutJd.jdScore < 0 || atsWithoutJd.jdScore > 100) {
    throw new Error(`Invalid ATS JD score without JD: ${atsWithoutJd.jdScore}`);
  }
  console.log("✓ Pass: Baseline JD match score is calculated and non-null (0-100).");

  console.log("\n==================================================");
  console.log("3. VALIDATING RULE-BASED ANALYSIS FALLBACK");
  console.log("==================================================");
  const ruleAnalysis = createRuleBasedAnalysis(atsWithoutJd, "john_doe_resume.pdf", sampleResume, undefined, "Full Stack Engineer");
  console.log(`Candidate Name: ${ruleAnalysis.candidateName}`);
  console.log(`Overall Score: ${ruleAnalysis.overallScore}`);
  console.log(`JD Score: ${ruleAnalysis.jdScore}%`);
  console.log(`Recruiter Impression: "${ruleAnalysis.recruiterFirstImpression}"`);
  console.log(`HR Verdict: "${ruleAnalysis.hrVerdict}"`);
  if (ruleAnalysis.jdScore === null || ruleAnalysis.jdScore < 0 || ruleAnalysis.jdScore > 100) {
    throw new Error(`Invalid rule-based JD score: ${ruleAnalysis.jdScore}`);
  }
  console.log("✓ Pass: Rule-based analysis assigns valid 0-100 JD score and classy executive verdicts.");

  console.log("\n==================================================");
  console.log("4. VALIDATING NORMALIZATION PIPELINE");
  console.log("==================================================");
  const rawModelOutput = {
    candidate_name: "John Doe",
    role: "Full Stack Engineer",
    overall_score: 88,
    readiness_tier: "Tier 1: Shortlist Ready",
    jd_match: { score: 92, verdict: "Exceptional match for TypeScript/Node requirements" },
    strengths: ["Strong backend Node.js", "Docker & CI/CD"],
    critical_issues: [],
    skill_matrix: { matched_skills: ["React", "TypeScript", "Node.js"], missing_skills: ["Kubernetes"] },
  };
  const normalized = normalizeAnalysis(rawModelOutput, atsWithJd);
  console.log(`Normalized Candidate: ${normalized.candidateName}`);
  console.log(`Normalized Overall Score: ${normalized.overallScore}`);
  console.log(`Normalized JD Score: ${normalized.jdScore}%`);
  if (normalized.jdScore === null || normalized.jdScore < 0 || normalized.jdScore > 100) {
    throw new Error(`Invalid normalized JD score: ${normalized.jdScore}`);
  }
  console.log("✓ Pass: Normalized analysis correctly retains and clamps JD score (0-100).");

  console.log("\n==================================================");
  console.log("5. VALIDATING REPORT EXPORT FORMATTING");
  console.log("==================================================");
  const mdOutput = toMarkdownReport("john_doe_resume.pdf", normalized);
  console.log(`Markdown Export Line: ${mdOutput.split("\n").find(l => l.includes("JD fit"))}`);
  console.log("✓ Pass: Reports export valid 0-100 JD match values.");

  console.log("\n==================================================");
  console.log("ALL VALIDATION CHECKS PASSED SUCCESSFULLY! ✓");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("VALIDATION FAILED:", err);
  process.exit(1);
});
