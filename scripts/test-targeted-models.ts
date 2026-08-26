import { buildMessages, extractJson } from "../src/lib/llm";
import { normalizeAnalysis } from "../src/lib/analysis-types";
import { getDb } from "../src/lib/mongodb.server";

const SAMPLE_RESUME = `
ALEX MORGAN
Email: alex.morgan@email.com | Phone: +1 (555) 234-5678 | GitHub: github.com/alexmorgan | LinkedIn: linkedin.com/in/alexmorgan

PROFESSIONAL SUMMARY
Results-driven Full-Stack Software Engineer with 3+ years of experience designing scalable microservices, distributed systems, and modern web applications. Proficient in TypeScript, React, Node.js, Python, PostgreSQL, and AWS. Demonstrated track record of reducing latency by 45% and optimizing cloud costs by $120K annually.

TECHNICAL SKILLS
- Languages: TypeScript, JavaScript (ES6+), Python, Go, SQL, HTML5/CSS3
- Frontend: React 18, Next.js, TanStack Query, TailwindCSS, Redux Toolkit
- Backend: Node.js, Express, FastAPI, GraphQL, RESTful APIs, gRPC
- Databases: PostgreSQL, MongoDB, Redis, Elasticsearch
- Cloud & DevOps: AWS (ECS, Lambda, S3, RDS), Docker, Kubernetes, GitHub Actions, Terraform

WORK EXPERIENCE
Senior Full-Stack Engineer | Nexus Cloud Solutions | San Francisco, CA | 2023 - Present
- Architected and deployed high-throughput event-driven microservices handling 15M+ daily requests using Node.js, Kafka, and PostgreSQL.
- Spearheaded database query optimization and Redis caching layer, decreasing p99 latency from 450ms to 85ms (81% improvement).
- Mentored a team of 4 junior developers, conducted daily code reviews, and championed CI/CD pipeline modernization with GitHub Actions.

Software Engineer | Apex FinTech Labs | Austin, TX | 2021 - 2023
- Developed customer-facing real-time financial portfolio analytics dashboards in React, TypeScript, and TailwindCSS used by 250K+ active users.
- Built automated fraud anomaly detection pipeline using Python, FastAPI, and PostgreSQL, reducing fraudulent transaction volume by 38%.
- Integrated Stripe and Plaid APIs for secure payment flows processing over $4.5M in monthly transactions.

EDUCATION
Bachelor of Science in Computer Science | University of Texas at Austin | Magna Cum Laude | 2017 - 2021
`;

const SAMPLE_JD = `
Role: Senior Full Stack Engineer (Cloud & Microservices)
Company: Radiance Tech
Requirements:
- 3+ years of experience with modern TypeScript/JavaScript, React, and Node.js.
- Strong knowledge of relational databases (PostgreSQL) and caching (Redis).
- Experience designing RESTful APIs, microservices, and Docker/AWS cloud deployments.
`;

async function main() {
  const db = await getDb();
  const config = await db.collection("system_settings").findOne({ key: "global_config" });

  const groqKey = String(config?.groqApiKey || process.env.GROQ_API_KEY || "").trim();
  const nvidiaKey = String(config?.nvidiaApiKey || process.env.NVIDIA_API_KEY || "").trim();
  const openrouterKey = String(config?.openrouterApiKey || process.env.OPENROUTER_API_KEY || "").trim();

  const candidates: Array<{ provider: string; modelId: string; endpoint: string; key: string }> = [
    // Groq with thinking disabled
    { provider: "groq", modelId: "openai/gpt-oss-120b", endpoint: "https://api.groq.com/openai/v1/chat/completions", key: groqKey },
    { provider: "groq", modelId: "openai/gpt-oss-20b", endpoint: "https://api.groq.com/openai/v1/chat/completions", key: groqKey },

    // NVIDIA NIM Candidates
    { provider: "nvidia", modelId: "meta/llama-3.2-11b-vision-instruct", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },
    { provider: "nvidia", modelId: "meta/llama-3.2-90b-vision-instruct", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },
    { provider: "nvidia", modelId: "google/gemma-3-12b-it", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },
    { provider: "nvidia", modelId: "google/gemma-3-4b-it", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },
    { provider: "nvidia", modelId: "google/gemma-4-31b-it", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },
    { provider: "nvidia", modelId: "mistralai/mixtral-8x22b-v0.1", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },
    { provider: "nvidia", modelId: "microsoft/phi-3.5-moe-instruct", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },
    { provider: "nvidia", modelId: "01-ai/yi-large", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },
    { provider: "nvidia", modelId: "stepfun-ai/step-3.7-flash", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey },

    // OpenRouter Free
    { provider: "openrouter", modelId: "z-ai/glm-5.2:free", endpoint: "https://openrouter.ai/api/v1/chat/completions", key: openrouterKey },
    { provider: "openrouter", modelId: "minimax/minimax-m2.7:free", endpoint: "https://openrouter.ai/api/v1/chat/completions", key: openrouterKey },
    { provider: "openrouter", modelId: "liquid/lfm-2.5-2.6b:free", endpoint: "https://openrouter.ai/api/v1/chat/completions", key: openrouterKey },
  ];

  const messages = buildMessages({
    fileName: "Alex_Morgan_Resume.pdf",
    resumeText: SAMPLE_RESUME,
    jobDescription: SAMPLE_JD,
    companyName: "Radiance Tech",
  });

  console.log("Testing targeted models for ATS scoring...\n");

  const passed: Array<{ provider: string; modelId: string; score: number; latency: number }> = [];

  for (const c of candidates) {
    if (!c.key) continue;
    process.stdout.write(`Testing [${c.provider.toUpperCase()}] ${c.modelId}... `);
    const t0 = Date.now();
    try {
      const res = await fetch(c.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.key}`,
          ...(c.provider === "openrouter" ? { "HTTP-Referer": "https://resumeradiance.com", "X-Title": "Resume Radiance" } : {}),
        },
        body: JSON.stringify({
          model: c.modelId,
          messages,
          temperature: 0.1,
          max_tokens: 3500,
          chat_template_kwargs: { thinking: false },
        }),
        signal: AbortSignal.timeout(30000),
      });

      const elapsed = Date.now() - t0;
      if (!res.ok) {
        const err = await res.text();
        console.log(`❌ HTTP ${res.status}: ${err.slice(0, 80)}`);
        continue;
      }

      const j = await res.json();
      const raw = j?.choices?.[0]?.message?.content ?? "";
      const parsed = extractJson(raw);
      const normalized = normalizeAnalysis(parsed, "Alex_Morgan_Resume.pdf");

      console.log(`✅ PASS (${elapsed}ms) -> ATS Score: ${normalized.overallScore}/100, Tier: ${normalized.readinessTier}`);
      passed.push({ provider: c.provider, modelId: c.modelId, score: normalized.overallScore, latency: elapsed });
    } catch (e: any) {
      const elapsed = Date.now() - t0;
      console.log(`❌ FAIL (${elapsed}ms): ${e.message?.slice(0, 80)}`);
    }

    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log("\n=================================================================");
  console.log("VERIFIED PASSING MODELS:");
  for (const p of passed) {
    console.log(`  - [${p.provider.toUpperCase()}] ${p.modelId} (Score: ${p.score}/100, Latency: ${p.latency}ms)`);
  }
  console.log("=================================================================");
}

main().catch(console.error);
