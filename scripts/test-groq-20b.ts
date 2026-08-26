import { buildMessages, extractJson } from "../src/lib/llm";
import { normalizeAnalysis } from "../src/lib/analysis-types";
import { getDb } from "../src/lib/mongodb.server";

const SAMPLE_RESUME = `
ALEX MORGAN
Email: alex.morgan@email.com | Phone: +1 (555) 234-5678 | GitHub: github.com/alexmorgan | LinkedIn: linkedin.com/in/alexmorgan

PROFESSIONAL SUMMARY
Results-driven Full-Stack Software Engineer with 3+ years of experience designing scalable microservices, distributed systems, and modern web applications. Proficient in TypeScript, React, Node.js, Python, PostgreSQL, and AWS.

TECHNICAL SKILLS
- Languages: TypeScript, JavaScript, Python, Go, SQL
- Frontend: React 18, Next.js, TanStack Query, TailwindCSS
- Backend: Node.js, Express, FastAPI, GraphQL, RESTful APIs
- Databases: PostgreSQL, MongoDB, Redis
- Cloud & DevOps: AWS (ECS, Lambda, S3), Docker, GitHub Actions

WORK EXPERIENCE
Senior Full-Stack Engineer | Nexus Cloud Solutions | 2023 - Present
- Architected and deployed microservices handling 15M+ daily requests using Node.js, Kafka, and PostgreSQL.
- Decreased p99 latency from 450ms to 85ms using Redis caching layer.

Software Engineer | Apex FinTech Labs | 2021 - 2023
- Developed customer-facing real-time financial portfolio analytics dashboards in React, TypeScript.
- Built automated fraud anomaly detection pipeline using Python and FastAPI.

EDUCATION
Bachelor of Science in Computer Science | University of Texas at Austin | 2017 - 2021
`;

const SAMPLE_JD = `
Role: Senior Full Stack Engineer
Company: Radiance Tech
Requirements:
- 3+ years of experience with TypeScript, React, and Node.js.
- Strong knowledge of PostgreSQL and Redis.
- Experience with AWS and Docker.
`;

async function main() {
  console.log("Waiting 15 seconds for Groq TPM rate-limit bucket to reset...");
  await new Promise((r) => setTimeout(r, 15000));

  const db = await getDb();
  const config = await db.collection("system_settings").findOne({ key: "global_config" });
  const groqKey = String(config?.groqApiKey || process.env.GROQ_API_KEY || "").trim();

  const messages = buildMessages({
    fileName: "Alex_Morgan_Resume.pdf",
    resumeText: SAMPLE_RESUME,
    jobDescription: SAMPLE_JD,
    companyName: "Radiance Tech",
  });

  console.log("Calling Groq model openai/gpt-oss-20b with max_tokens: 1800...");
  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages,
      temperature: 0.1,
      max_tokens: 1800,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const elapsed = Date.now() - t0;
  if (!res.ok) {
    console.log("HTTP Error:", res.status, await res.text());
    return;
  }

  const j = await res.json();
  const raw = j?.choices?.[0]?.message?.content ?? "";
  console.log(`\n=== RAW COMPLETION (${raw.length} chars) ===\n${raw}\n=== END RAW ===\n`);

  try {
    const parsed = extractJson(raw);
    console.log("extractJson succeeded!");
    const normalized = normalizeAnalysis(parsed, "Alex_Morgan_Resume.pdf");
    console.log("\n✅ SUCCESSFUL ATS ANALYSIS:");
    console.log(`   Candidate: ${normalized.candidateName}`);
    console.log(`   Overall Score: ${normalized.overallScore}/100 (${normalized.readinessTier})`);
    console.log(`   Strengths:`, normalized.strengths);
    console.log(`   Critical Issues:`, normalized.criticalIssues.map((i) => i.problem));
    console.log(`   Skills Matched:`, normalized.skillMatrix.matched);
    console.log(`   Skills Missing:`, normalized.skillMatrix.missing);
  } catch (e: any) {
    console.log("❌ Parse error:", e);
  }
}

main().catch(console.error);
