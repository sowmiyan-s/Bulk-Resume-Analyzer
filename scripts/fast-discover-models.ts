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

async function testSingleModel(
  item: { provider: string; modelId: string; endpoint: string; key: string },
  messages: any
) {
  const t0 = Date.now();
  try {
    const res = await fetch(item.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${item.key}`,
        ...(item.provider === "openrouter"
          ? { "HTTP-Referer": "https://resumeradiance.com", "X-Title": "Resume Radiance" }
          : {}),
      },
      body: JSON.stringify({
        model: item.modelId,
        messages,
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const elapsed = Date.now() - t0;
    if (!res.ok) {
      const err = await res.text();
      return { success: false, err: `HTTP ${res.status}: ${err.slice(0, 60)}`, elapsed };
    }

    const j = (await res.json()) as Record<string, unknown>;
    const text = extractContent(j);
    if (!text.trim()) return { success: false, err: "Empty completion", elapsed };

    const parsed = extractJson(text);
    const normalized = normalizeAnalysis(parsed, "Alex_Morgan_Resume.pdf");

    return {
      success: true,
      score: normalized.overallScore,
      tier: normalized.readinessTier,
      strengths: normalized.strengths.length,
      issues: normalized.criticalIssues.length,
      elapsed,
    };
  } catch (e: any) {
    return { success: false, err: e.message?.slice(0, 60), elapsed: Date.now() - t0 };
  }
}

async function main() {
  const db = await getDb();
  const config = await db.collection("system_settings").findOne({ key: "global_config" });

  const groqKey = String(config?.groqApiKey || process.env.GROQ_API_KEY || "").trim();
  const nvidiaKey = String(config?.nvidiaApiKey || process.env.NVIDIA_API_KEY || "").trim();
  const openrouterKey = String(config?.openrouterApiKey || process.env.OPENROUTER_API_KEY || "").trim();

  // 1. OpenRouter free candidates
  const orRes = await fetch("https://openrouter.ai/api/v1/models");
  const orData = orRes.ok ? await orRes.json() : null;
  const orModels: string[] = [];
  for (const m of orData?.data || []) {
    const id = m.id as string;
    const pPrompt = m.pricing?.prompt;
    const pComp = m.pricing?.completion;
    if (id.endsWith(":free") || (pPrompt === "0" && pComp === "0") || (pPrompt === 0 && pComp === 0)) {
      orModels.push(id);
    }
  }

  // 2. NVIDIA NIM candidates
  const nvRes = await fetch("https://integrate.api.nvidia.com/v1/models", {
    headers: { Authorization: `Bearer ${nvidiaKey}` },
  });
  const nvData = nvRes.ok ? await nvRes.json() : null;
  const nvModels: string[] = [];
  for (const m of nvData?.data || []) {
    const id = m.id as string;
    if (
      !id.includes("embed") &&
      !id.includes("rerank") &&
      !id.includes("clip") &&
      !id.includes("whisper") &&
      !id.includes("sdxl") &&
      !id.includes("stable-diffusion")
    ) {
      nvModels.push(id);
    }
  }

  // 3. Groq models
  const groqRes = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${groqKey}` },
  });
  const groqData = groqRes.ok ? await groqRes.json() : null;
  const grModels: string[] = [];
  for (const m of groqData?.data || []) {
    const id = m.id as string;
    if (m.active !== false && !id.includes("whisper") && !id.includes("guard")) {
      grModels.push(id);
    }
  }

  const allCandidates: Array<{ provider: string; modelId: string; endpoint: string; key: string }> = [];

  for (const m of grModels) {
    allCandidates.push({ provider: "groq", modelId: m, endpoint: "https://api.groq.com/openai/v1/chat/completions", key: groqKey });
  }

  for (const m of orModels) {
    allCandidates.push({ provider: "openrouter", modelId: m, endpoint: "https://openrouter.ai/api/v1/chat/completions", key: openrouterKey });
  }

  for (const m of nvModels) {
    allCandidates.push({ provider: "nvidia", modelId: m, endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: nvidiaKey });
  }

  console.log(`Discovered ${allCandidates.length} total candidate models. Testing concurrently with worker pool...\n`);

  const messages = buildMessages({
    fileName: "Alex_Morgan_Resume.pdf",
    resumeText: SAMPLE_RESUME,
    jobDescription: SAMPLE_JD,
    companyName: "Radiance Tech",
  });

  const verified: Array<{ provider: string; modelId: string; score: number; tier: string; latency: number }> = [];

  // Run in chunks of 5 parallel requests
  const CHUNK_SIZE = 4;
  for (let i = 0; i < allCandidates.length; i += CHUNK_SIZE) {
    const chunk = allCandidates.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (c) => {
        const res = await testSingleModel(c, messages);
        return { c, res };
      })
    );

    for (const { c, res } of results) {
      if (res.success) {
        console.log(`✅ [${c.provider.toUpperCase()}] ${c.modelId.padEnd(45)} -> Score: ${res.score}/100 | ${res.tier} (${res.elapsed}ms)`);
        verified.push({ provider: c.provider, modelId: c.modelId, score: res.score!, tier: res.tier!, latency: res.elapsed });
      } else {
        console.log(`❌ [${c.provider.toUpperCase()}] ${c.modelId.padEnd(45)} -> ${res.err} (${res.elapsed}ms)`);
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n==========================================================");
  console.log(`🏆 ALL VERIFIED LIVE WORKING MODELS (${verified.length} Total):`);
  console.log("==========================================================");

  verified.sort((a, b) => a.latency - b.latency);
  for (const v of verified) {
    console.log(`• [${v.provider.toUpperCase()}] ${v.modelId.padEnd(45)} | Score: ${v.score}/100 | Latency: ${v.latency}ms`);
  }
}

main().catch(console.error);
