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
  console.log("Waiting 12 seconds for Groq rate-limit reset...");
  await new Promise((r) => setTimeout(r, 12000));

  const db = await getDb();
  const config = await db.collection("system_settings").findOne({ key: "global_config" });
  const groqKey = String(config?.groqApiKey || process.env.GROQ_API_KEY || "").trim();

  const messages = buildMessages({
    fileName: "Alex_Morgan_Resume.pdf",
    resumeText: SAMPLE_RESUME,
    jobDescription: SAMPLE_JD,
    companyName: "Radiance Tech",
  });

  // Ensure prompt asks for concise JSON
  messages[1]!.content += "\n\nCRITICAL CONCISENESS REQUIREMENT: Provide maximum 3 strengths, 3 critical issues, and 3 bullet rewrites so the JSON is concise, complete, and never truncated.";

  console.log("Testing Groq model: openai/gpt-oss-120b...");
  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
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
  console.log(`Extracted text length: ${text.length} chars`);
  console.log(`--- FIRST 500 CHARS ---\n${text.slice(0, 500)}\n----------------------\n`);
  console.log(`--- LAST 500 CHARS ---\n${text.slice(-500)}\n----------------------\n`);

  let normalized: any;
  try {
    const parsed = extractJson(text);
    normalized = normalizeAnalysis(parsed, "Alex_Morgan_Resume.pdf");
    console.log(`\n🎉 ATS SCORING SUCCEEDED in ${elapsed}ms!`);
    console.log(`   Candidate: "${normalized.candidateName}"`);
    console.log(`   Overall Score: ${normalized.overallScore}/100`);
    console.log(`   Readiness Tier: ${normalized.readinessTier}`);
    console.log(`   Strengths (${normalized.strengths.length}):`, normalized.strengths);
    console.log(`   Critical Issues (${normalized.criticalIssues.length}):`, normalized.criticalIssues.map((i: any) => i.problem));
    console.log(`   Skill Matrix: Matched: ${normalized.skillMatrix.matched.join(", ")} | Missing: ${normalized.skillMatrix.missing.join(", ")}`);
  } catch (e: any) {
    console.log("Parse error:", e);
  }
}

main().catch(console.error);
