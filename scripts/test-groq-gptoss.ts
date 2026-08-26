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
  const db = await getDb();
  const config = await db.collection("system_settings").findOne({ key: "global_config" });
  const groqKey = String(config?.groqApiKey || process.env.GROQ_API_KEY || "").trim();

  const models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

  const messages = buildMessages({
    fileName: "Alex_Morgan_Resume.pdf",
    resumeText: SAMPLE_RESUME,
    jobDescription: SAMPLE_JD,
    companyName: "Radiance Tech",
  });

  for (const model of models) {
    console.log(`\nTesting Groq model: ${model}...`);
    const t0 = Date.now();
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1,
          max_tokens: 3000,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const elapsed = Date.now() - t0;
      if (!res.ok) {
        const err = await res.text();
        console.log(`❌ HTTP ${res.status}: ${err}`);
        continue;
      }

      const j = await res.json();
      const raw = j?.choices?.[0]?.message?.content ?? "";
      console.log(`FULL RAW:\n${raw}\n------------------\n`);

      try {
        const parsed = JSON.parse(raw);
        console.log("Direct JSON.parse succeeded!");
      } catch (err: any) {
        console.log("Direct JSON.parse failed:", err.message);
      }

      const parsed = extractJson(raw);
      const normalized = normalizeAnalysis(parsed, "Alex_Morgan_Resume.pdf");

      console.log(`✅ SUCCESS in ${elapsed}ms!`);
      console.log(`   Candidate: "${normalized.candidateName}" | Score: ${normalized.overallScore}/100 (${normalized.readinessTier})`);
      console.log(`   JD Relevance: ${normalized.sectionAudits?.internships?.jdRelevancePct}% | Basis: ${normalized.evaluationBasis}`);
      console.log(`   Strengths (${normalized.strengths.length}): ${normalized.strengths.slice(0, 2).join(" | ")}`);
      console.log(`   Critical Issues: ${normalized.criticalIssues.length}`);
    } catch (e: any) {
      console.log(`❌ Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
