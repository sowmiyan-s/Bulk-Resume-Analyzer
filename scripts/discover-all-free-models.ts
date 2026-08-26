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

  const groqKey = String(config?.groqApiKey || process.env.GROQ_API_KEY || "").trim();
  const nvidiaKey = String(config?.nvidiaApiKey || process.env.NVIDIA_API_KEY || "").trim();
  const openrouterKey = String(config?.openrouterApiKey || process.env.OPENROUTER_API_KEY || "").trim();

  console.log("==========================================================");
  console.log("🔍 DISCOVERING ALL ACTIVE MODELS FROM LIVE APIS");
  console.log("==========================================================\n");

  // 1. Discover OpenRouter Free models
  const openRouterFreeModels: string[] = [];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (res.ok) {
      const data = await res.json();
      for (const m of data?.data || []) {
        const id = m.id as string;
        const pPrompt = m.pricing?.prompt;
        const pComp = m.pricing?.completion;
        if (id.endsWith(":free") || (pPrompt === "0" && pComp === "0") || (pPrompt === 0 && pComp === 0)) {
          openRouterFreeModels.push(id);
        }
      }
      console.log(`Found ${openRouterFreeModels.length} free models on OpenRouter:`);
      console.log(openRouterFreeModels.slice(0, 15).join(", ") + (openRouterFreeModels.length > 15 ? "..." : ""));
    }
  } catch (e: any) {
    console.warn("OpenRouter discovery failed:", e.message);
  }

  // 2. Discover NVIDIA NIM models
  const nvidiaModels: string[] = [];
  if (nvidiaKey) {
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
        headers: { Authorization: `Bearer ${nvidiaKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        for (const m of data?.data || []) {
          const id = m.id as string;
          // Filter out embeddings / rerankers / audio / vision-only
          if (
            !id.includes("embed") &&
            !id.includes("rerank") &&
            !id.includes("clip") &&
            !id.includes("whisper") &&
            !id.includes("sdxl") &&
            !id.includes("stable-diffusion")
          ) {
            nvidiaModels.push(id);
          }
        }
        console.log(`\nFound ${nvidiaModels.length} text/chat models on NVIDIA NIM:`);
        console.log(nvidiaModels.slice(0, 15).join(", ") + (nvidiaModels.length > 15 ? "..." : ""));
      }
    } catch (e: any) {
      console.warn("NVIDIA NIM discovery failed:", e.message);
    }
  }

  // 3. Discover Groq models
  const groqModels: string[] = [];
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${groqKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        for (const m of data?.data || []) {
          const id = m.id as string;
          if (m.active !== false && !id.includes("whisper") && !id.includes("orpheus")) {
            groqModels.push(id);
          }
        }
        console.log(`\nFound ${groqModels.length} text models on Groq:`);
        console.log(groqModels.join(", "));
      }
    } catch (e: any) {
      console.warn("Groq discovery failed:", e.message);
    }
  }

  // Assemble full candidate list to test
  const candidateList: Array<{ provider: string; modelId: string; endpoint: string; key: string }> = [];

  for (const m of openRouterFreeModels) {
    candidateList.push({
      provider: "openrouter",
      modelId: m,
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      key: openrouterKey,
    });
  }

  for (const m of nvidiaModels) {
    candidateList.push({
      provider: "nvidia",
      modelId: m,
      endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
      key: nvidiaKey,
    });
  }

  for (const m of groqModels) {
    candidateList.push({
      provider: "groq",
      modelId: m,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      key: groqKey,
    });
  }

  console.log(`\n==========================================================`);
  console.log(`🚀 TESTING ${candidateList.length} CANDIDATE MODELS WITH ATS RESUME AUDIT`);
  console.log(`==========================================================\n`);

  const passedModels: Array<{
    provider: string;
    modelId: string;
    score: number;
    tier: string;
    latency: number;
    strengthsCount: number;
    issuesCount: number;
  }> = [];

  const messages = buildMessages({
    fileName: "Alex_Morgan_Resume.pdf",
    resumeText: SAMPLE_RESUME,
    jobDescription: SAMPLE_JD,
    companyName: "Radiance Tech",
  });

  for (let i = 0; i < candidateList.length; i++) {
    const item = candidateList[i]!;
    if (!item.key) continue;

    process.stdout.write(`[${i + 1}/${candidateList.length}] [${item.provider.toUpperCase()}] ${item.modelId}... `);
    const t0 = Date.now();

    try {
      const res = await fetch(item.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${item.key}`,
          ...(item.provider === "openrouter" ? { "HTTP-Referer": "https://resumeradiance.com", "X-Title": "Resume Radiance" } : {}),
        },
        body: JSON.stringify({
          model: item.modelId,
          messages,
          temperature: 0.1,
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(25000),
      });

      const elapsed = Date.now() - t0;

      if (!res.ok) {
        const err = await res.text();
        console.log(`❌ HTTP ${res.status}: ${err.slice(0, 90)}`);
        // If rate-limited, sleep extra
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        continue;
      }

      const j = (await res.json()) as Record<string, unknown>;
      const text = extractContent(j);
      if (!text.trim()) {
        console.log(`❌ Empty text in choices`);
        continue;
      }

      const parsed = extractJson(text);
      const normalized = normalizeAnalysis(parsed, "Alex_Morgan_Resume.pdf");

      console.log(
        `✅ SUCCESS in ${elapsed}ms -> Score: ${normalized.overallScore}/100 | Tier: ${normalized.readinessTier} | Strengths: ${normalized.strengths.length} | Issues: ${normalized.criticalIssues.length}`
      );

      passedModels.push({
        provider: item.provider,
        modelId: item.modelId,
        score: normalized.overallScore,
        tier: normalized.readinessTier,
        latency: elapsed,
        strengthsCount: normalized.strengths.length,
        issuesCount: normalized.criticalIssues.length,
      });
    } catch (e: any) {
      const elapsed = Date.now() - t0;
      console.log(`❌ FAIL (${elapsed}ms): ${e.message?.slice(0, 90)}`);
    }

    // Adaptive throttle to prevent hitting RPM limits
    await new Promise((r) => setTimeout(r, item.provider === "groq" ? 5000 : 1500));
  }

  console.log("\n==========================================================");
  console.log(`🏆 ALL VERIFIED WORKING MODELS (${passedModels.length} Total):`);
  console.log("==========================================================");

  // Sort by latency ascending
  passedModels.sort((a, b) => a.latency - b.latency);
  for (const m of passedModels) {
    console.log(
      `  • [${m.provider.toUpperCase()}] ${m.modelId.padEnd(45)} | Latency: ${String(m.latency).padStart(5)}ms | ATS Score: ${m.score}/100 | ${m.tier}`
    );
  }
  console.log("==========================================================\n");
}

main().catch(console.error);
