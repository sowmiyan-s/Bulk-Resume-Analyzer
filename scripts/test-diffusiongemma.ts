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

function extractContent(json: Record<string, unknown>): string {
  const choices = json["choices"] as Array<Record<string, unknown>> | undefined;
  if (choices?.length) {
    const msg = choices[0]!["message"] as Record<string, unknown> | undefined;
    const content = msg?.["content"];
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      return content.map((p) => (p as Record<string, unknown>)?.["text"] ?? "").join("");
    }
    const reasoning = msg?.["reasoning_content"] || msg?.["reasoning"];
    if (typeof reasoning === "string" && reasoning.trim()) return reasoning;

    const textField = choices[0]!["text"];
    if (typeof textField === "string" && textField.trim()) return textField;
  }
  return "";
}

async function main() {
  const db = await getDb();
  const config = await db.collection("system_settings").findOne({ key: "global_config" });
  const nvidiaKey = String(config?.nvidiaApiKey || process.env.NVIDIA_API_KEY || "").trim();

  const messages = buildMessages({
    fileName: "Alex_Morgan_Resume.pdf",
    resumeText: SAMPLE_RESUME,
    jobDescription: SAMPLE_JD,
    companyName: "Radiance Tech",
  });

  console.log("Testing NVIDIA NIM model: google/diffusiongemma-26b-a4b-it...");
  const t0 = Date.now();
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${nvidiaKey}`,
    },
    body: JSON.stringify({
      model: "google/diffusiongemma-26b-a4b-it",
      messages,
      temperature: 0.1,
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const elapsed = Date.now() - t0;
  if (!res.ok) {
    console.log("HTTP Error:", res.status, await res.text());
    return;
  }

  const j = (await res.json()) as Record<string, unknown>;
  const text = extractContent(j);

  const parsed = extractJson(text);
  const normalized = normalizeAnalysis(parsed, "Alex_Morgan_Resume.pdf");

  console.log(`\n🎉 ATS AUDIT VERIFIED in ${elapsed}ms!`);
  console.log(`   Candidate: "${normalized.candidateName}"`);
  console.log(`   Overall ATS Score: ${normalized.overallScore}/100`);
  console.log(`   Readiness Tier: ${normalized.readinessTier}`);
  console.log(`   JD Relevance: ${normalized.sectionAudits.internships.jdRelevancePct}%`);
  console.log(`   Strengths (${normalized.strengths.length}):`, normalized.strengths);
  console.log(`   Critical Issues (${normalized.criticalIssues.length}):`, normalized.criticalIssues.map((i) => i.problem));
  console.log(`   Skills Matched: ${normalized.skillMatrix.matched.join(", ")}`);
  console.log(`   Skills Missing: ${normalized.skillMatrix.missing.join(", ")}`);
}

main().catch(console.error);
