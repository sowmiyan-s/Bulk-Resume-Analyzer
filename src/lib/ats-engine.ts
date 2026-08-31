/**
 * Deterministic, rule-based ATS engine.
 *
 * This is the *real* score: it is computed from the resume text itself with
 * explicit, auditable rules — no model involved, no randomness, same input
 * always yields the same number. The LLM is used only for descriptive
 * feedback and is re-anchored to these numbers, so scores can never be
 * hallucinated.
 *
 * Runs entirely in the browser in a few milliseconds, so throughput is not
 * limited by AI quotas (100+ resumes/day is trivial).
 */

import {
  classifyRoleArc,
  detectAiTools,
  type RoleArc,
  type ToolTaxonomyResult,
} from "./role-taxonomy";
import { analyzeGrammar, type GrammarIssue } from "./grammar-engine";

export type AtsCheck = {
  id: string;
  label: string;
  passed: boolean;
  /** Points earned for this check. */
  points: number;
  max: number;
  /** Verbatim evidence pulled from the resume (or the reason it failed). */
  detail: string;
};

export type AtsCategory = {
  id: string;
  label: string;
  score: number;
  max: number;
  checks: AtsCheck[];
};

export type AtsReport = {
  /** 0-100 deterministic ATS score. */
  score: number;
  /** 0-100 keyword coverage vs the job description (null when no JD). */
  jdScore: number | null;
  categories: AtsCategory[];
  metrics: {
    words: number;
    bullets: number;
    quantifiedBullets: number;
    actionVerbBullets: number;
    estimatedPages: number;
    longestBulletWords: number;
    sectionsFound: string[];
    sectionsMissing: string[];
    skillsFound: string[];
    jdKeywords: string[];
    jdMatched: string[];
    jdMissing: string[];
    readabilityWordsPerBullet: number;
    /** Grammar, spelling, and typo issues detected */
    grammarIssues: GrammarIssue[];
    grammarErrorsList: string[];
    /** High-level role arc detected from the resume text. */
    roleArc: RoleArc;
    /** GenAI / domestic-AI tool taxonomy detected from the resume text. */
    toolTaxonomy: ToolTaxonomyResult;
  };
  /** Hard blockers an applicant tracking system would trip on. */
  blockers: string[];
  computedAt: string;
};

/* ------------------------------- vocab ------------------------------- */

const ACTION_VERBS = [
  "accelerated", "accomplished", "achieved", "adapted", "administered", "analyzed", "appended", "applied",
  "architected", "audited", "authored", "automated", "benchmarked", "boosted", "built", "calculated",
  "centralized", "championed", "compiled", "composed", "computed", "conceptualized", "conducted", "configured",
  "consolidated", "constructed", "containerized", "converted", "coordinated", "created", "customized", "cut",
  "debugged", "decreased", "defined", "delegated", "delivered", "demonstrated", "deployed", "designed",
  "developed", "devised", "diagnosed", "directed", "discovered", "dispatched", "distributed", "documented",
  "doubled", "drafted", "drove", "eliminated", "embedded", "enabled", "engineered", "enhanced",
  "established", "evaluated", "exceeded", "executed", "expanded", "expedited", "extracted", "fabricated",
  "facilitated", "fine-tuned", "formulated", "founded", "generated", "guided", "handled", "headed",
  "identified", "implemented", "improved", "incorporated", "increased", "indexed", "initiated", "innovated",
  "inspected", "installed", "instituted", "integrated", "interfaced", "introduced", "invented", "investigated",
  "launched", "lead", "led", "leveraged", "maintained", "managed", "mapped", "marshaled",
  "maximized", "measured", "mentored", "migrated", "minimized", "modeled", "modernized", "modified",
  "monitored", "motivated", "navigated", "negotiated", "obtained", "operated", "optimized", "orchestrated",
  "organized", "originated", "overhauled", "oversaw", "packaged", "partnered", "performed", "pioneered",
  "planned", "positioned", "prepared", "presented", "prevented", "prioritized", "processed", "produced",
  "programmed", "projected", "promoted", "proposed", "protected", "prototyped", "provided", "published",
  "queried", "raised", "reached", "realized", "rebuilt", "received", "recommended", "reconciled",
  "recorded", "recruited", "redesigned", "reduced", "refactored", "refined", "regulated", "reinforced",
  "remodeled", "rendered", "reorganized", "replaced", "reported", "represented", "researched", "resolved",
  "restructured", "retrieved", "revamped", "reviewed", "revised", "revitalized", "routed", "saved",
  "scaled", "scheduled", "screened", "scripted", "scrutinized", "secured", "selected", "served",
  "shaped", "shared", "shipped", "simplified", "simulated", "slashed", "solicited", "solved",
  "spearheaded", "specialized", "specified", "standardized", "started", "steered", "streamlined", "strengthened",
  "structured", "succeeded", "summarized", "supervised", "supplied", "supported", "surpassed", "synthesized",
  "systematized", "targeted", "taught", "tested", "tracked", "trained", "transcribed", "transformed",
  "translated", "transmitted", "tripled", "troubleshot", "unified", "unlocked", "upgraded", "utilized",
  "validated", "verified", "visualized", "won", "wrote",
];

const WEAK_PHRASES = [
  "hardworking",
  "hard working",
  "team player",
  "passionate",
  "go-getter",
  "think outside the box",
  "detail oriented",
  "detail-oriented",
  "responsible for",
  "duties included",
  "results driven",
  "self motivated",
  "self-motivated",
  "quick learner",
  "good communication skills",
  "dynamic professional",
];

const SKILL_TAXONOMY = [
  // Programming Languages
  "python", "java", "javascript", "typescript", "c++", "c#", "golang", "go", "rust", "kotlin",
  "swift", "dart", "php", "ruby", "scala", "r", "matlab", "solidity", "bash", "shell", "powershell", "sql", "c",
  // Frontend & Mobile
  "react", "react native", "next.js", "angular", "vue", "nuxt", "svelte", "sveltekit", "flutter",
  "ios", "android", "html", "html5", "css", "css3", "tailwind", "bootstrap", "sass", "redux", "zustand", "vite", "webpack",
  // Backend, Frameworks & Protocols
  "node.js", "node", "express", "django", "flask", "fastapi", "spring", "spring boot", ".net", "asp.net",
  "nest.js", "laravel", "rails", "graphql", "rest", "restful", "grpc", "websocket", "websockets", "trpc",
  "microservices", "system design", "api design", "oop", "data structures", "algorithms",
  // Databases & Vector Stores
  "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "oracle", "cassandra", "dynamodb",
  "elasticsearch", "snowflake", "bigquery", "faiss", "chromadb", "pinecone", "qdrant", "weaviate", "supabase", "firebase",
  // Cloud, DevOps & Infrastructure
  "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "terraform", "ansible", "helm",
  "jenkins", "github actions", "gitlab ci", "ci/cd", "linux", "nginx", "git", "github", "gitlab",
  "prometheus", "grafana", "devops", "cloud architecture",
  // AI, ML & Data Engineering
  "machine learning", "deep learning", "data analysis", "data engineering", "nlp", "computer vision",
  "llm", "llms", "rag", "langchain", "llamaindex", "crewai", "autogen", "mcp", "hugging face",
  "vllm", "ollama", "fine-tuning", "pytorch", "tensorflow", "keras", "scikit-learn", "opencv",
  "pandas", "numpy", "polars", "pyarrow", "spark", "hadoop", "kafka", "airflow", "tableau", "power bi", "dbt",
  // Testing, QA & Security
  "jest", "pytest", "junit", "cypress", "playwright", "selenium", "postman", "unit testing", "tdd",
  "cybersecurity", "penetration testing", "agile", "scrum", "jira", "figma",
];

const SECTION_PATTERNS: Array<{ id: string; label: string; re: RegExp; required: boolean }> = [
  {
    id: "contact",
    label: "Contact details",
    re: /(email|phone|mobile|linkedin|github|@)/i,
    required: true,
  },
  {
    id: "summary",
    label: "Summary / Objective",
    re: /^\s*(professional\s+)?(summary|profile|objective|about\s+me)\b/im,
    required: false,
  },
  {
    id: "skills",
    label: "Skills",
    re: /^\s*(technical\s+)?(skills|technologies|tech\s+stack|core\s+competencies)\b/im,
    required: true,
  },
  {
    id: "experience",
    label: "Experience / Internships",
    re: /^\s*(work\s+)?(experience|employment|internships?|professional\s+experience)\b/im,
    required: true,
  },
  {
    id: "education",
    label: "Education",
    re: /^\s*(education|academic|qualifications)\b/im,
    required: true,
  },
  {
    id: "projects",
    label: "Projects",
    re: /^\s*(projects?|personal\s+projects|academic\s+projects)\b/im,
    required: true,
  },
  {
    id: "certifications",
    label: "Certifications",
    re: /^\s*(certifications?|licenses?|accreditations?|courses)\b/im,
    required: false,
  },
  {
    id: "achievements",
    label: "Achievements",
    re: /^\s*(achievements?|awards?|honou?rs|accomplishments|extra[- ]?curricular)\b/im,
    required: false,
  },
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "our",
  "are",
  "will",
  "that",
  "this",
  "from",
  "have",
  "has",
  "who",
  "were",
  "was",
  "not",
  "but",
  "all",
  "any",
  "can",
  "its",
  "their",
  "they",
  "them",
  "then",
  "than",
  "into",
  "out",
  "about",
  "across",
  "after",
  "also",
  "been",
  "being",
  "best",
  "both",
  "each",
  "more",
  "most",
  "must",
  "need",
  "other",
  "over",
  "such",
  "some",
  "team",
  "teams",
  "work",
  "working",
  "role",
  "job",
  "able",
  "strong",
  "good",
  "years",
  "year",
  "plus",
  "etc",
  "new",
  "use",
  "using",
  "within",
  "while",
  "when",
  "what",
  "which",
  "would",
  "should",
  "could",
  "every",
  "ensure",
  "help",
  "join",
  "looking",
  "ideal",
  "candidate",
  "candidates",
  "company",
  "responsibilities",
  "requirements",
  "qualifications",
  "preferred",
  "experience",
  "skills",
  "knowledge",
]);

/* ------------------------------- helpers ------------------------------- */

const lc = (s: string) => s.toLowerCase();
const uniq = (a: string[]) => Array.from(new Set(a));

function getLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function getBullets(lines: string[]): string[] {
  return lines
    .filter(
      (l) =>
        /^[-•*▪◦‣·–—>]/.test(l) || (l.length > 40 && /^[A-Z][a-z]+ed\b|^[A-Z][a-z]+ing\b/.test(l)),
    )
    .map((l) => l.replace(/^[-•*▪◦‣·–—>]+\s*/, "").trim());
}

const QUANT_RE =
  /(\d+(\.\d+)?\s?%|\$\s?\d|₹\s?\d|\b\d{2,}\+?\b|\b\d+(\.\d+)?\s?(x|k|m|bn|hrs?|hours?|days?|weeks?|months?|users?|requests?|records?|ms|sec|seconds?|gb|tb|qps|rps)\b)/i;

function containsAny(text: string, needles: string[]): string[] {
  const l = lc(text);
  return needles.filter((n) => {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9+#.])${esc}([^a-z0-9+#.]|$)`, "i").test(l);
  });
}

function jdKeywords(jd: string): string[] {
  const explicitSkills = containsAny(jd, SKILL_TAXONOMY);
  const tokens = lc(jd)
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([t]) => t);
  return uniq([...explicitSkills, ...top]).slice(0, 40);
}

function check(
  id: string,
  label: string,
  passed: boolean,
  points: number,
  max: number,
  detail: string,
): AtsCheck {
  return { id, label, passed, points: Math.max(0, Math.round(points * 10) / 10), max, detail };
}

const cat = (id: string, label: string, checks: AtsCheck[], max: number): AtsCategory => ({
  id,
  label,
  max,
  score: Math.min(max, Math.round(checks.reduce((s, c) => s + c.points, 0) * 10) / 10),
  checks,
});

/* ------------------------------- engine ------------------------------- */

export function runAtsEngine(resumeText: string, jobDescription?: string): AtsReport {
  const text = resumeText ?? "";
  const lines = getLines(text);
  const bullets = getBullets(lines);
  const words = text.split(/\s+/).filter(Boolean).length;
  const estimatedPages = Math.max(1, Math.round((words / 500) * 10) / 10);

  const quantifiedBullets = bullets.filter((b) => QUANT_RE.test(b)).length;
  const actionVerbBullets = bullets.filter((b) => {
    const firstFew = lc(b)
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .slice(0, 3);
    return firstFew.some((w) => ACTION_VERBS.includes(w));
  }).length;
  const hasProofOfWork =
    /(npm install|pip install|pypi\.org|npmjs\.com|patent|research paper|ijcrt|ieee|springer|published in|hackathon|leetcode|codeforces|kaggle|1st prize|2nd prize|3rd prize)/i.test(
      text,
    );
  const longestBulletWords = bullets.reduce((m, b) => Math.max(m, b.split(/\s+/).length), 0);
  const readabilityWordsPerBullet = bullets.length
    ? Math.round((bullets.reduce((s, b) => s + b.split(/\s+/).length, 0) / bullets.length) * 10) /
      10
    : 0;

  const sectionsFound: string[] = [];
  const sectionsMissing: string[] = [];
  for (const s of SECTION_PATTERNS) {
    if (s.re.test(text)) sectionsFound.push(s.label);
    else sectionsMissing.push(s.label);
  }

  const skillsFound = containsAny(text, SKILL_TAXONOMY);
  const blockers: string[] = [];

  /* --- 1. Parseability & contact (20) --- */
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
  const hasPhone = /(\+?\d[\d\s().-]{7,}\d)/.test(text);
  const hasLinkedIn = /linkedin\.com\/[a-z0-9-]+/i.test(text);
  const hasGithubOrPortfolio =
    /(github\.com\/|gitlab\.com\/|https?:\/\/[a-z0-9-]+\.(dev|io|com|app|me)\b)/i.test(text);
  const parse: AtsCheck[] = [
    check(
      "email",
      "Machine-readable email address",
      hasEmail,
      hasEmail ? 5 : 0,
      5,
      hasEmail
        ? (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "")
        : "No email found — ATS cannot create a candidate record.",
    ),
    check(
      "phone",
      "Phone number present",
      hasPhone,
      hasPhone ? 4 : 0,
      4,
      hasPhone ? "Phone number detected." : "No parsable phone number found.",
    ),
    check(
      "linkedin",
      "LinkedIn profile URL",
      hasLinkedIn,
      hasLinkedIn ? 3 : 0,
      3,
      hasLinkedIn
        ? "LinkedIn URL present."
        : "No LinkedIn URL — recruiters cannot verify your profile.",
    ),
    check(
      "portfolio",
      "GitHub / portfolio link",
      hasGithubOrPortfolio,
      hasGithubOrPortfolio ? 4 : 0,
      4,
      hasGithubOrPortfolio
        ? "Verifiable code/portfolio link present."
        : "No GitHub or portfolio link — projects are unverifiable.",
    ),
    check(
      "textlayer",
      "Extractable text layer",
      words > 120,
      words > 120 ? 4 : Math.max(0, words / 40),
      4,
      words > 120
        ? `${words} words extracted cleanly.`
        : `Only ${words} words extracted — likely a scanned image or graphics-heavy layout.`,
    ),
  ];
  if (!hasEmail) blockers.push("No email address detected — most ATS reject the file outright.");
  if (words <= 120)
    blockers.push("Very little machine-readable text — resume is likely image-based.");

  /* --- 2. Section structure (20) --- */
  const requiredSections = SECTION_PATTERNS.filter((s) => s.required);
  const requiredHit = requiredSections.filter((s) => s.re.test(text)).length;
  const optionalHit = SECTION_PATTERNS.filter((s) => !s.required && s.re.test(text)).length;
  const structureChecks: AtsCheck[] = [
    check(
      "req-sections",
      "Standard ATS section headings",
      requiredHit === requiredSections.length,
      (requiredHit / requiredSections.length) * 12,
      12,
      `${requiredHit}/${requiredSections.length} required headings found. Missing: ${
        requiredSections
          .filter((s) => !s.re.test(text))
          .map((s) => s.label)
          .join(", ") || "none"
      }`,
    ),
    check(
      "opt-sections",
      "Supporting sections (certs / achievements / summary)",
      optionalHit >= 2,
      Math.min(4, optionalHit * 1.4),
      4,
      `${optionalHit}/3 supporting sections present.`,
    ),
    check(
      "dates",
      "Dated experience entries",
      /(19|20)\d{2}\s*[-–—to]+\s*((19|20)\d{2}|present|current)/i.test(text),
      /(19|20)\d{2}\s*[-–—to]+\s*((19|20)\d{2}|present|current)/i.test(text) ? 4 : 0,
      4,
      /(19|20)\d{2}/.test(text)
        ? "Date ranges detected on entries."
        : "No date ranges — ATS cannot build a timeline.",
    ),
  ];
  if (requiredHit < requiredSections.length - 1) {
    blockers.push(
      "Multiple standard sections missing — keyword parsers will mis-file your content.",
    );
  }

  /* --- 3. Impact & writing quality (25) --- */
  const quantRatio = bullets.length ? quantifiedBullets / bullets.length : 0;
  const verbRatio = bullets.length ? actionVerbBullets / bullets.length : 0;
  const weakHits = containsAny(text, WEAK_PHRASES);
  const firstPerson = (text.match(/\b(I|my|me)\b/g) ?? []).length;
  const quantScore = Math.min(
    10,
    Math.max(
      quantRatio * 20,
      Math.min(10, (quantifiedBullets >= 2 ? 6 : quantifiedBullets * 3) + (hasProofOfWork ? 4 : 0)),
    ),
  );
  const impact: AtsCheck[] = [
    check(
      "bullets",
      "Uses bullet points",
      bullets.length >= 6,
      Math.min(5, bullets.length * 0.5),
      5,
      `${bullets.length} bullet points detected.`,
    ),
    check(
      "quantified",
      "Quantified achievements & verifiable proof",
      quantRatio >= 0.35 || (quantifiedBullets >= 2 && hasProofOfWork),
      quantScore,
      10,
      hasProofOfWork
        ? `${quantifiedBullets}/${bullets.length || 0} bullets with metrics + verifiable published artifacts/proof.`
        : `${quantifiedBullets}/${bullets.length || 0} bullets contain measurable outcomes.`,
    ),
    check(
      "verbs",
      "Bullets start with strong action verbs",
      verbRatio >= 0.5,
      Math.min(6, verbRatio * 10),
      6,
      `${actionVerbBullets}/${bullets.length || 0} bullets open with action verbs.`,
    ),
    check(
      "weak",
      "Free of clichés and filler",
      weakHits.length === 0,
      Math.max(0, 2 - weakHits.length * 0.7),
      2,
      weakHits.length ? `Clichés found: ${weakHits.join(", ")}` : "No filler phrases detected.",
    ),
    check(
      "person",
      "Third-person / implied-subject voice",
      firstPerson <= 2,
      firstPerson <= 2 ? 2 : Math.max(0, 2 - firstPerson * 0.3),
      2,
      firstPerson <= 2
        ? "No first-person narration."
        : `${firstPerson} first-person pronouns ("I", "my") found.`,
    ),
  ];

  /* --- 4. Skills & architecture depth (20) --- */
  const highBarSignals = containsAny(text, [
    "distributed systems", "concurrency", "multithreading", "event-driven", "microservices",
    "kafka", "rabbitmq", "redis", "caching", "database indexing", "sharding", "connection pooling",
    "rate limiting", "jwt", "oauth", "sandboxed", "docker", "kubernetes", "grpc", "websockets",
    "ci/cd", "unit testing", "system design", "memory optimization", "p2p", "local embeddings",
    "rag", "vector search", "faiss", "multi-agent", "mcp", "leetcode", "codeforces", "hackathon",
    "patent", "research paper", "pypi", "npm package", "open source",
  ]);

  const skillChecks: AtsCheck[] = [
    check(
      "skill-count",
      "Recognised technical keywords",
      skillsFound.length >= 10,
      Math.min(8, skillsFound.length * 0.6),
      8,
      `${skillsFound.length} known skills matched: ${skillsFound.slice(0, 10).join(", ")}${skillsFound.length > 10 ? "…" : ""}`,
    ),
    check(
      "architecture-depth",
      "Production architecture & Tier-1 SDE signals",
      highBarSignals.length >= 2,
      Math.min(6, Math.max(2, highBarSignals.length * 1.5)),
      6,
      highBarSignals.length > 0
        ? `${highBarSignals.length} production architecture signals detected (${highBarSignals.slice(0, 4).join(", ")}).`
        : "No production architecture signals (Docker, Redis, microservices, concurrency, or packages) found.",
    ),
    check(
      "tooling",
      "Cloud / DevOps / testing tooling present",
      containsAny(text, [
        "aws",
        "azure",
        "gcp",
        "docker",
        "kubernetes",
        "ci/cd",
        "jenkins",
        "github actions",
        "pytest",
        "jest",
        "junit",
        "terraform",
        "git",
      ]).length > 0,
      Math.min(
        6,
        containsAny(text, [
          "aws",
          "azure",
          "gcp",
          "docker",
          "kubernetes",
          "ci/cd",
          "jenkins",
          "github actions",
          "pytest",
          "jest",
          "junit",
          "terraform",
          "git",
        ]).length * 1.5,
      ),
      6,
      "Modern engineering tooling signals reliability to screeners.",
    ),
  ];

  /* --- 5. Length & formatting hygiene (15) --- */
  const grammarAnalysis = analyzeGrammar(text);
  const tooLong = longestBulletWords > 45;
  const hasTableChars = /\|\s*\S+\s*\|/.test(text);
  const specialGlyphs = (text.match(/[^\x00-\x7F\u2018\u2019\u201c\u201d\u2013\u2014•₹]/g) ?? [])
    .length;
  const lengthOk = words >= 300 && words <= 900;
  const fmt: AtsCheck[] = [
    check(
      "length",
      "Appropriate length (roughly 1 page / 300-900 words)",
      lengthOk,
      lengthOk
        ? 5
        : words < 300
          ? Math.max(0, (words / 300) * 5)
          : Math.max(0, 5 - ((words - 900) / 300) * 3),
      5,
      `${words} words ≈ ${estimatedPages} page(s).`,
    ),
    check(
      "bulletlen",
      "Bullets stay scannable (< 45 words)",
      !tooLong,
      tooLong ? 1 : 3,
      3,
      `Longest bullet is ${longestBulletWords} words; average ${readabilityWordsPerBullet}.`,
    ),
    check(
      "tables",
      "No tables / multi-column layout artefacts",
      !hasTableChars,
      hasTableChars ? 0 : 2,
      2,
      hasTableChars
        ? "Table pipes detected — columns often scramble in ATS parsers."
        : "No table or column artefacts.",
    ),
    check(
      "glyphs",
      "Clean character encoding (no OCR garbage)",
      specialGlyphs < 20,
      specialGlyphs < 20 ? 2 : Math.max(0, 2 - specialGlyphs / 60),
      2,
      specialGlyphs < 20
        ? "Character encoding is clean."
        : `${specialGlyphs} unusual glyphs — likely OCR noise.`,
    ),
    check(
      "grammar",
      "Grammar, spelling & phrasing hygiene",
      grammarAnalysis.issues.length === 0,
      Math.max(0, 3 - grammarAnalysis.scorePenalty * 0.3),
      3,
      grammarAnalysis.issues.length === 0
        ? "Grammar and spelling are clean."
        : `${grammarAnalysis.issues.length} grammar/typo issue(s) detected: ${grammarAnalysis.formattedList.slice(0, 2).join("; ")}`,
    ),
  ];
  if (hasTableChars)
    blockers.push("Table/column layout detected — reformat to a single-column flow.");
  if (tooLong)
    blockers.push(`A ${longestBulletWords}-word bullet will be skimmed past by recruiters.`);
  if (grammarAnalysis.issues.length >= 6)
    blockers.push(`High number of grammar & spelling errors (${grammarAnalysis.issues.length} detected) will trigger recruiter rejection.`);

  const categories: AtsCategory[] = [
    cat("parse", "ATS Parseability & Contact", parse, 20),
    cat("structure", "Section Structure", structureChecks, 20),
    cat("impact", "Impact & Writing Quality", impact, 25),
    cat("skills", "Skills & Keyword Coverage", skillChecks, 20),
    cat("format", "Formatting Hygiene", fmt, 15),
  ];

  let score = Math.round(categories.reduce((s, c) => s + c.score, 0));

  /* --- JD / Global SDE Core keyword match (deterministic) --- */
  let jdScore: number | null = null;
  let kws: string[] = [];
  let matched: string[] = [];
  let missing: string[] = [];
  const hasCustomJd = Boolean(jobDescription && jobDescription.trim().length >= 5);

  if (hasCustomJd) {
    kws = jdKeywords(jobDescription!);
    matched = kws.filter((k) => containsAny(text, [k]).length > 0);
    missing = kws.filter((k) => !matched.includes(k));
    jdScore = kws.length ? Math.round((matched.length / kws.length) * 100) : null;
    if (jdScore !== null) {
      score = Math.round(score * 0.7 + jdScore * 0.3);
      if (jdScore < 35) {
        blockers.push(`Only ${jdScore}% of job-description keywords appear in the resume.`);
      }
    }
  } else {
    // Global common baseline requirements for Software Development Engineer (SDE)
    const GLOBAL_SDE_REQUIREMENTS = [
      "python",
      "java",
      "javascript",
      "typescript",
      "c++",
      "data structures",
      "algorithms",
      "oop",
      "sql",
      "postgresql",
      "mysql",
      "mongodb",
      "react",
      "node.js",
      "express",
      "django",
      "fastapi",
      "rest",
      "api design",
      "git",
      "linux",
      "docker",
      "ci/cd",
      "unit testing",
      "system design",
    ];
    kws = GLOBAL_SDE_REQUIREMENTS;
    matched = kws.filter((k) => containsAny(text, [k]).length > 0);
    missing = kws.filter((k) => !matched.includes(k));
    // SDE benchmark: matching 8-10 core competencies represents solid entry/mid SDE benchmark
    jdScore = Math.min(100, Math.max(10, Math.round((matched.length / 8) * 100)));
  }

  const roleArc = classifyRoleArc(text);
  const toolTaxonomy = detectAiTools(text);

  return {
    score: Math.max(0, Math.min(100, score)),
    jdScore,
    categories,
    metrics: {
      words,
      bullets: bullets.length,
      quantifiedBullets,
      actionVerbBullets,
      estimatedPages,
      longestBulletWords,
      sectionsFound,
      sectionsMissing,
      skillsFound,
      jdKeywords: kws,
      jdMatched: matched,
      jdMissing: missing.slice(0, 20),
      readabilityWordsPerBullet,
      grammarIssues: grammarAnalysis.issues,
      grammarErrorsList: grammarAnalysis.formattedList,
      roleArc: roleArc.arc,
      toolTaxonomy,
    },
    blockers,
    computedAt: new Date().toISOString(),
  };
}

/** Compact, token-cheap fact sheet handed to the LLM so its prose matches the real score. */
export function atsFactSheet(report: AtsReport): string {
  const lines = [
    `DETERMINISTIC ATS ENGINE RESULT (authoritative — do NOT contradict or restate a different overall score):`,
    `real_ats_score=${report.score}/100${report.jdScore !== null ? `, jd_keyword_match=${report.jdScore}%` : ""}`,
    ...report.categories.map(
      (c) =>
        `${c.label}: ${c.score}/${c.max} — ${
          c.checks
            .filter((k) => !k.passed)
            .map((k) => k.label)
            .join("; ") || "all checks passed"
        }`,
    ),
    `metrics: words=${report.metrics.words}, bullets=${report.metrics.bullets}, quantified=${report.metrics.quantifiedBullets}, action_verb_bullets=${report.metrics.actionVerbBullets}, longest_bullet=${report.metrics.longestBulletWords}w, pages≈${report.metrics.estimatedPages}`,
    `sections_missing: ${report.metrics.sectionsMissing.join(", ") || "none"}`,
    `skills_detected: ${report.metrics.skillsFound.slice(0, 25).join(", ") || "none"}`,
    report.metrics.jdMissing.length
      ? `jd_keywords_missing: ${report.metrics.jdMissing.slice(0, 15).join(", ")}`
      : "",
    report.blockers.length ? `hard_blockers: ${report.blockers.join(" | ")}` : "",
    `role_arc: ${report.metrics.roleArc}`,
    `ai_tooling: ${report.metrics.toolTaxonomy.summary}`,
  ].filter(Boolean);
  return lines.join("\n");
}
