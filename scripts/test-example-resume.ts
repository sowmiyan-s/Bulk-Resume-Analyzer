/**
 * End-to-end ATS resume analysis validator across all free models.
 * Tests each model with a realistic candidate resume and verifies structured ATS output.
 * Run with: npx vite-node scripts/test-example-resume.ts
 */

import { buildMessages, extractJson } from "../src/lib/llm";
import { normalizeAnalysis, type NormalizedAnalysis } from "../src/lib/analysis-types";
import { getDb, pingMongo } from "../src/lib/mongodb.server";

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

KEY PROJECTS
- Distributed Task Queue: Built a fault-tolerant job scheduler in Go and Redis with exponential backoff and worker pooling supporting 10,000 tasks/sec.
- Radiance ATS Scanner: Full-stack AI resume auditing tool using Next.js, OpenAI API, and MongoDB with instant keyword matching and PDF extraction.

EDUCATION
Bachelor of Science in Computer Science | University of Texas at Austin | Magna Cum Laude (GPA: 3.85/4.0) | 2017 - 2021
`;

const SAMPLE_JD = `
Role: Senior Full Stack Engineer (Cloud & Microservices)
Company: Radiance Tech
Requirements:
- 3+ years of experience with modern TypeScript/JavaScript, React, and Node.js.
- Strong knowledge of relational databases (PostgreSQL) and caching (Redis).
- Experience designing RESTful APIs, microservices, and Docker/AWS cloud deployments.
- Solid understanding of CI/CD pipelines, automated testing, and performance profiling.
`;

interface ModelTestTarget {
  provider: "groq" | "openrouter" | "nvidia" | "qwen" | "gemini" | "cerebras";
  modelId: string;
  label: string;
  tag: "Recommended" | "High Speed" | "Deep Reasoning" | "Code & Tech" | "High Rate Limit";
  endpoint: string;
}

async function main() {
  console.log("=================================================================");
  console.log("🚀 END-TO-END ATS RESUME SCORING MODEL VALIDATION");
  console.log("=================================================================\n");

  const mongoStatus = await pingMongo();
  const vaultKeys: Record<string, string> = {};

  if (mongoStatus.ok) {
    try {
      const db = await getDb();
      const config = await db.collection("system_settings").findOne({ key: "global_config" });
      if (config) {
        if (config["groqApiKey"]) vaultKeys["groq"] = String(config["groqApiKey"]).trim();
        if (config["openrouterApiKey"]) vaultKeys["openrouter"] = String(config["openrouterApiKey"]).trim();
        if (config["nvidiaApiKey"]) vaultKeys["nvidia"] = String(config["nvidiaApiKey"]).trim();
        if (config["qwenApiKey"]) vaultKeys["qwen"] = String(config["qwenApiKey"]).trim();
        if (config["cerebrasApiKey"]) vaultKeys["cerebras"] = String(config["cerebrasApiKey"]).trim();
        if (config["geminiApiKey"]) vaultKeys["gemini"] = String(config["geminiApiKey"]).trim();
      }
    } catch (e) {
      console.warn("Could not read vault:", e);
    }
  }

  // Fallbacks
  if (typeof process !== "undefined" && process.env) {
    if (!vaultKeys["groq"]) vaultKeys["groq"] = (process.env["GROQ_API_KEY"] || "").trim();
    if (!vaultKeys["openrouter"]) vaultKeys["openrouter"] = (process.env["OPENROUTER_API_KEY"] || "").trim();
    if (!vaultKeys["nvidia"]) vaultKeys["nvidia"] = (process.env["NVIDIA_API_KEY"] || "").trim();
    if (!vaultKeys["qwen"]) vaultKeys["qwen"] = (process.env["QWEN_API_KEY"] || "").trim();
    if (!vaultKeys["cerebras"]) vaultKeys["cerebras"] = (process.env["CEREBRAS_API_KEY"] || "").trim();
    if (!vaultKeys["gemini"]) vaultKeys["gemini"] = (process.env["GEMINI_API_KEY"] || "").trim();
  }

  console.log("🔑 Available Keys:");
  for (const [k, v] of Object.entries(vaultKeys)) {
    console.log(`  - ${k.padEnd(12)}: ${v ? "Present (" + v.length + " chars)" : "None"}`);
  }

  // Candidate models to test
  const candidateModels: ModelTestTarget[] = [
    // Groq
    { provider: "groq", modelId: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)", tag: "Recommended", endpoint: "https://api.groq.com/openai/v1/chat/completions" },
    { provider: "groq", modelId: "openai/gpt-oss-20b", label: "GPT-OSS 20B (Groq)", tag: "High Speed", endpoint: "https://api.groq.com/openai/v1/chat/completions" },
    { provider: "groq", modelId: "groq/compound", label: "Groq Compound (Groq)", tag: "High Rate Limit", endpoint: "https://api.groq.com/openai/v1/chat/completions" },
    { provider: "groq", modelId: "groq/compound-mini", label: "Groq Compound Mini (Groq)", tag: "High Speed", endpoint: "https://api.groq.com/openai/v1/chat/completions" },

    // OpenRouter Free
    { provider: "openrouter", modelId: "openrouter/free", label: "OpenRouter Auto-Free", tag: "Recommended", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
    { provider: "openrouter", modelId: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 120B (OpenRouter :free)", tag: "Deep Reasoning", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
    { provider: "openrouter", modelId: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning (OpenRouter :free)", tag: "High Speed", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
    { provider: "openrouter", modelId: "cohere/north-mini-code:free", label: "Cohere North Mini Code (OpenRouter :free)", tag: "Code & Tech", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
    { provider: "openrouter", modelId: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (OpenRouter :free)", tag: "Recommended", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
    { provider: "openrouter", modelId: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B (OpenRouter :free)", tag: "High Speed", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
    { provider: "openrouter", modelId: "minimax/minimax-m3:free", label: "MiniMax M3 (OpenRouter :free)", tag: "High Rate Limit", endpoint: "https://openrouter.ai/api/v1/chat/completions" },

    // NVIDIA NIM
    { provider: "nvidia", modelId: "openai/gpt-oss-120b", label: "GPT-OSS 120B (NVIDIA NIM)", tag: "Recommended", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions" },
    { provider: "nvidia", modelId: "openai/gpt-oss-20b", label: "GPT-OSS 20B (NVIDIA NIM)", tag: "High Speed", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions" },
    { provider: "nvidia", modelId: "meta/llama-3.2-11b-vision-instruct", label: "Llama 3.2 11B (NVIDIA NIM)", tag: "High Speed", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions" },
    { provider: "nvidia", modelId: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B (NVIDIA NIM)", tag: "Deep Reasoning", endpoint: "https://integrate.api.nvidia.com/v1/chat/completions" },
  ];

  console.log(`\nTesting ${candidateModels.length} candidate models with a full ATS audit prompt...\n`);

  const messages = buildMessages({
    fileName: "Alex_Morgan_Resume.pdf",
    resumeText: SAMPLE_RESUME,
    jobDescription: SAMPLE_JD,
    companyName: "Radiance Tech",
  });

  const verifiedWorkingModels: Array<{
    target: ModelTestTarget;
    analysis: NormalizedAnalysis;
    latencyMs: number;
  }> = [];

  const failedModels: Array<{
    target: ModelTestTarget;
    error: string;
  }> = [];

  for (const target of candidateModels) {
    const key = vaultKeys[target.provider];
    if (!key) {
      console.log(`⏩ Skipping ${target.label} (No API key in vault)`);
      continue;
    }

    console.log(`-----------------------------------------------------------------`);
    console.log(`Testing: [${target.provider.toUpperCase()}] ${target.modelId}`);

    const t0 = Date.now();
    try {
      const isDeepSeek = target.modelId.toLowerCase().includes("deepseek");
      const isGptOss = target.modelId.toLowerCase().includes("gpt-oss");
      const isCompound = target.modelId.toLowerCase().includes("compound");

      const body = {
        model: target.modelId,
        messages,
        temperature: 0.2,
        max_tokens: 2500,
        ...(!isDeepSeek && !isGptOss && !isCompound ? { response_format: { type: "json_object" } } : {}),
        ...(isDeepSeek ? { chat_template_kwargs: { thinking: false } } : {}),
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(target.provider === "openrouter" ? { "HTTP-Referer": "https://resumeradiance.com", "X-Title": "Resume Radiance" } : {}),
      };

      const res = await fetch(target.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(40000),
      });

      const elapsed = Date.now() - t0;

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.log(`❌ FAILED (HTTP ${res.status}): ${errText.slice(0, 150)}`);
        failedModels.push({ target, error: `HTTP ${res.status}: ${errText.slice(0, 100)}` });
        continue;
      }

      const json = await res.json();
      const rawContent = json?.choices?.[0]?.message?.content ?? "";

      if (!rawContent) {
        console.log(`❌ FAILED: Empty response choices content`);
        failedModels.push({ target, error: "Empty completion content" });
        continue;
      }

      // Parse JSON
      const parsed = extractJson(rawContent);
      const normalized = normalizeAnalysis(parsed, "Alex_Morgan_Resume.pdf");

      console.log(`✅ SUCCESS in ${elapsed}ms!`);
      console.log(`   Candidate: "${normalized.candidateName}" | ATS Score: ${normalized.overallScore}/100 (${normalized.readinessTier})`);
      console.log(`   JD Relevance: ${normalized.sectionAudits?.internships?.jdRelevancePct ?? "N/A"}% | Basis: ${normalized.evaluationBasis}`);
      console.log(`   Top Strengths (${normalized.strengths?.length ?? 0}): ${normalized.strengths?.slice(0, 2).join(" | ")}`);
      console.log(`   Critical Issues Flagged: ${normalized.criticalIssues?.length ?? 0} issues`);
      console.log(`   Skills Matched: ${normalized.skillMatrix?.matched?.length ?? 0} | Missing: ${normalized.skillMatrix?.missing?.length ?? 0}`);

      verifiedWorkingModels.push({
        target,
        analysis: normalized,
        latencyMs: elapsed,
      });
    } catch (err: unknown) {
      const elapsed = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ FAILED after ${elapsed}ms: ${msg}`);
      failedModels.push({ target, error: msg });
    }

    // Cooldown between calls to avoid burst rate-limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n=================================================================");
  console.log("📋 FINAL VERIFICATION SUMMARY");
  console.log("=================================================================\n");

  console.log(`✅ VERIFIED WORKING MODELS WITH VALID RESUME SCORING (${verifiedWorkingModels.length}):`);
  for (const vm of verifiedWorkingModels) {
    console.log(`  • [${vm.target.provider.toUpperCase()}] ${vm.target.modelId.padEnd(40)} -> Score: ${vm.analysis.atsScore}/100 | Latency: ${vm.latencyMs}ms`);
  }

  if (failedModels.length > 0) {
    console.log(`\n❌ FAILED MODELS (${failedModels.length}):`);
    for (const fm of failedModels) {
      console.log(`  • [${fm.target.provider.toUpperCase()}] ${fm.target.modelId.padEnd(40)} -> ${fm.error}`);
    }
  }

  console.log("\n=================================================================");
}

main().catch(console.error);
