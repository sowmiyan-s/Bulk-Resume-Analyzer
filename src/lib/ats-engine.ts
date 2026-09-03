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
    /** Detailed document segmentation & extracted structure */
    parsedDocument?: ParsedDocument;
  };
  /** Hard blockers an applicant tracking system would trip on. */
  blockers: string[];
  computedAt: string;
};

export type ParsedSectionType =
  | "contact"
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "projects"
  | "certifications"
  | "achievements"
  | "other";

export type ParsedSection = {
  type: ParsedSectionType;
  title: string;
  lines: string[];
  rawText: string;
};

export type ParsedDocument = {
  sections: ParsedSection[];
  projectEntries: Array<{ name: string; bullets: string[]; tools: string[] }>;
  experienceEntries: Array<{ title: string; bullets: string[] }>;
  bullets: string[];
  powerVerbCount: number;
  standardVerbCount: number;
  weakVerbBullets: string[];
  provenSkills: string[];
  educationSnippet?: string;
};

/* ------------------------------- vocab ------------------------------- */

export const POWER_VERBS = [
  "architected", "automated", "benchmarked", "boosted", "centralized", "containerized",
  "deployed", "designed", "engineered", "fine-tuned", "implemented", "innovated",
  "migrated", "optimized", "orchestrated", "overhauled", "pioneered", "refactored",
  "scaled", "spearheaded", "streamlined", "transformed", "unified", "upgraded",
];

export const STANDARD_VERBS = [
  "accelerated", "achieved", "analyzed", "applied", "authored", "built", "calculated",
  "compiled", "configured", "constructed", "converted", "coordinated", "created",
  "debugged", "delivered", "developed", "devised", "diagnosed", "directed", "discovered",
  "drafted", "established", "evaluated", "executed", "expanded", "formulated",
  "generated", "identified", "integrated", "launched", "maintained", "managed",
  "modeled", "modified", "monitored", "programmed", "published", "queried",
  "reduced", "resolved", "restructured", "retrieved", "reviewed", "revised",
  "saved", "secured", "structured", "tested", "tracked", "trained", "validated",
  "verified", "wrote",
];

export const ACTION_VERBS = [...POWER_VERBS, ...STANDARD_VERBS];

export const PASSIVE_PHRASES = [
  "assisted with",
  "helped with",
  "worked on",
  "responsible for",
  "duties included",
  "tasked with",
  "involved in",
  "participated in",
  "handled",
  "contributed to",
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
    re: /(email|phone|mobile|tel|linkedin|github|portfolio|contact|@)/i,
    required: true,
  },
  {
    id: "skills",
    label: "Skills & Technologies",
    re: /\b(technical\s+|core\s+|key\s+|computer\s+|programming\s+)?(skills?|skillset|skill-set|technologies|tech\s+stack|competencies|proficiencies|languages\s*(&|and)\s*frameworks)\b/i,
    required: true,
  },
  {
    id: "projects",
    label: "Projects",
    re: /\b(personal\s+|academic\s+|key\s+|technical\s+|selected\s+|notable\s+|major\s+|mini\s+|capstone\s+)?(projects?|project\s+work|initiatives)\b/i,
    required: true,
  },
  {
    id: "experience",
    label: "Experience / Internships",
    re: /\b(work\s+|professional\s+|job\s+|practical\s+|relevant\s+|industrial\s+)?(experience|employment|internships?|work\s+history|job\s+history|training)\b/i,
    required: true,
  },
  {
    id: "summary",
    label: "Professional Summary",
    re: /\b(professional\s+|career\s+|executive\s+)?(summary|profile|objective|about\s+me|overview)\b/i,
    required: false,
  },
  {
    id: "education",
    label: "Education (Optional)",
    re: /\b(educational\s+|academic\s+|scholastic\s+)?(education|qualifications?|background|academics|degrees?)\b/i,
    required: false,
  },
  {
    id: "certifications",
    label: "Certifications (Optional)",
    re: /\b(certifications?|certificates?|licenses?|accreditations?|courses|trainings?\s*(&|and)\s*certifications?)\b/i,
    required: false,
  },
  {
    id: "achievements",
    label: "Achievements & Awards (Optional)",
    re: /\b(achievements?|awards?|honou?rs|accomplishments|extra[- ]?curricular|co[- ]?curricular|coding\s+profiles|hackathons?|publications?)\b/i,
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

/** A contact header such as "name | email | LinkedIn" is not a table. */
function hasTableLayout(lines: string[]): boolean {
  const pipeRows = lines.filter((line) => (line.match(/\|/g) ?? []).length >= 2);
  if (pipeRows.length < 3) return false;
  const columnCounts = new Set(pipeRows.map((line) => (line.match(/\|/g) ?? []).length));
  return columnCounts.size <= 2 || pipeRows.some((line) => /-{2,}/.test(line));
}

function hasDateRange(text: string): boolean {
  return (
    /(?:19|20)\d{2}\s*(?:[-–—]|to)\s*(?:(?:19|20)\d{2}|present|current)/i.test(text) ||
    /\b(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}\s*[-–—]\s*(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}\b/i.test(text) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\s*[-–—]/i.test(text)
  );
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
  if (explicitSkills.length >= 3) {
    return uniq(explicitSkills);
  }
  // If few explicit taxonomy skills were found, extract technical-looking tokens only (excluding generic English corporate words)
  const tokens = lc(jd)
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 3 &&
        !STOP_WORDS.has(t) &&
        !/^\d+$/.test(t) &&
        !/^(responsibilities|requirements|opportunity|experience|candidate|qualifications|position|role|company|working|looking|ability|knowledge|skills|understanding|team|teams|strong|excellent|good|years|degree|bachelor|master|plus|preferred|bonus|hands-on|environment|solutions|business|develop|build|design|support|create)$/i.test(
          t,
        ),
    );
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);
  return uniq([...explicitSkills, ...top]).slice(0, 15);
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

/* ------------------------------- document parser ------------------------------- */

export function parseDocumentSections(text: string): ParsedDocument {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection = {
    type: "contact",
    title: "Header",
    lines: [],
    rawText: "",
  };

  const isHeaderLine = (line: string): { isHeader: boolean; type: ParsedSectionType; title: string } => {
    if (line.length > 65 || /^[-•*▪◦‣·–—>\d.]\s/.test(line)) {
      return { isHeader: false, type: "other", title: "" };
    }
    const clean = line.replace(/^[#•\-\*|>:\s]+|[#•\-\*|>:\s]+$/g, "").trim();
    if (!clean) return { isHeader: false, type: "other", title: "" };

    if (/\b(professional\s+|career\s+|executive\s+)?(summary|profile|objective|about\s+me|overview)\b/i.test(clean)) {
      return { isHeader: true, type: "summary", title: clean };
    }
    if (/\b(technical\s+|core\s+|key\s+|computer\s+|programming\s+|software\s+|it\s+)?(skills?|skillset|skill-set|technologies|tech\s+stack|competencies|proficiencies|languages\s*(&|and)\s*frameworks|tools\s*(&|and)\s*technologies)\b/i.test(clean)) {
      return { isHeader: true, type: "skills", title: clean };
    }
    if (/\b(work\s+|professional\s+|job\s+|practical\s+|relevant\s+|industrial\s+)?(experience|employment|internships?|work\s+history|job\s+history|training|work\s+experience)\b/i.test(clean)) {
      return { isHeader: true, type: "experience", title: clean };
    }
    if (/\b(educational\s+|academic\s+|scholastic\s+)?(education|qualifications?|background|academics|degrees?)\b/i.test(clean)) {
      return { isHeader: true, type: "education", title: clean };
    }
    if (/\b(personal\s+|academic\s+|key\s+|technical\s+|selected\s+|notable\s+|major\s+|mini\s+|capstone\s+|software\s+)?(projects?|project\s+work|project\s+details|project\s+experience|initiatives)\b/i.test(clean)) {
      return { isHeader: true, type: "projects", title: clean };
    }
    if (/\b(certifications?|certificates?|licenses?|accreditations?|courses|trainings?\s*(&|and)\s*certifications?)\b/i.test(clean)) {
      return { isHeader: true, type: "certifications", title: clean };
    }
    if (/\b(achievements?|awards?|honou?rs|accomplishments|extra[- ]?curricular|co[- ]?curricular|coding\s+profiles|hackathons?|publications?)\b/i.test(clean)) {
      return { isHeader: true, type: "achievements", title: clean };
    }
    return { isHeader: false, type: "other", title: "" };
  };

  for (const line of lines) {
    const checkHeader = isHeaderLine(line);
    if (checkHeader.isHeader) {
      if (currentSection.lines.length > 0 || currentSection.type !== "contact") {
        currentSection.rawText = currentSection.lines.join("\n");
        sections.push(currentSection);
      }
      currentSection = {
        type: checkHeader.type,
        title: checkHeader.title,
        lines: [],
        rawText: "",
      };
    } else {
      currentSection.lines.push(line);
    }
  }
  if (currentSection.lines.length > 0) {
    currentSection.rawText = currentSection.lines.join("\n");
    sections.push(currentSection);
  }

  // Extract project entries from projects section
  const projectEntries: Array<{ name: string; bullets: string[]; tools: string[] }> = [];
  const prjSec = sections.find((s) => s.type === "projects");
  if (prjSec) {
    let curPrj: { name: string; bullets: string[]; tools: string[] } | null = null;
    for (const l of prjSec.lines) {
      const isBullet = /^[-•*▪◦‣·–—>]/.test(l) || (l.length > 40 && /^[A-Z]/.test(l));
      if (!isBullet && l.length < 50 && !/^(20\d\d|19\d\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(l)) {
        if (curPrj) projectEntries.push(curPrj);
        curPrj = { name: l.replace(/[:\-–|]+$/, "").trim(), bullets: [], tools: [] };
      } else if (curPrj) {
        if (isBullet) curPrj.bullets.push(l.replace(/^[-•*▪◦‣·–—>]+\s*/, "").trim());
        const toolsInLine = containsAny(l, SKILL_TAXONOMY);
        for (const t of toolsInLine) if (!curPrj.tools.includes(t)) curPrj.tools.push(t);
      }
    }
    if (curPrj) projectEntries.push(curPrj);
  }

  const allBullets = getBullets(lines);
  const bulletText = allBullets.join(" ").toLowerCase();
  const provenSkills = containsAny(bulletText, SKILL_TAXONOMY);

  const powerVerbCount = allBullets.filter((b) => {
    const firstFew = lc(b).replace(/[^a-z\s]/g, " ").split(/\s+/).slice(0, 2);
    return firstFew.some((w) => POWER_VERBS.includes(w));
  }).length;

  const standardVerbCount = allBullets.filter((b) => {
    const firstFew = lc(b).replace(/[^a-z\s]/g, " ").split(/\s+/).slice(0, 2);
    return firstFew.some((w) => STANDARD_VERBS.includes(w));
  }).length;

  const weakVerbBullets = allBullets.filter((b) => {
    const l = lc(b);
    return PASSIVE_PHRASES.some((p) => l.startsWith(p) || l.includes(` ${p}`));
  });

  const eduSec = sections.find((s) => s.type === "education");
  const educationSnippet = eduSec ? eduSec.lines.slice(0, 3).join(", ") : undefined;

  return {
    sections,
    projectEntries,
    experienceEntries: [],
    bullets: allBullets,
    powerVerbCount,
    standardVerbCount,
    weakVerbBullets,
    provenSkills,
    educationSnippet,
  };
}

/* ------------------------------- engine ------------------------------- */

export function runAtsEngine(resumeText: string, jobDescription?: string): AtsReport {
  const text = resumeText ?? "";
  const lines = getLines(text);
  const parsed = parseDocumentSections(text);
  const bullets = parsed.bullets;
  const words = text.split(/\s+/).filter(Boolean).length;
  const estimatedPages = Math.max(1, Math.round((words / 500) * 10) / 10);

  const quantifiedBullets = bullets.filter((b) => QUANT_RE.test(b)).length;
  const actionVerbBullets = parsed.powerVerbCount + parsed.standardVerbCount;
  // Proof in experience/projects is meaningful; a keyword in a skills list
  // alone must not make a shallow resume look senior.
  const evidenceText = parsed.sections
    .filter((section) => section.type === "experience" || section.type === "projects")
    .map((section) => section.rawText)
    .join("\n");
  const hasProofOfWork =
    /(npm install|pip install|pypi\.org|npmjs\.com|patent|research paper|ijcrt|ieee|springer|published in|hackathon|leetcode|codeforces|kaggle|1st prize|2nd prize|3rd prize)/i.test(
      evidenceText,
    );
  const longestBulletWords = bullets.reduce((m, b) => Math.max(m, b.split(/\s+/).length), 0);
  const readabilityWordsPerBullet = bullets.length
    ? Math.round((bullets.reduce((s, b) => s + b.split(/\s+/).length, 0) / bullets.length) * 10) /
      10
    : 0;

  const sectionsFound: string[] = [];
  const sectionsMissing: string[] = [];
  for (const s of SECTION_PATTERNS) {
    if (parsed.sections.some((sec) => sec.type === s.id)) {
      sectionsFound.push(s.label);
    } else if (s.required) {
      sectionsMissing.push(s.label);
    }
  }

  const skillsFound = containsAny(text, SKILL_TAXONOMY);
  const blockers: string[] = [];

  /* --- 1. Parseability & contact (20 max) --- */
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
      hasPhone ? 5 : 0,
      5,
      hasPhone ? "Phone number detected." : "No parsable phone number found.",
    ),
    check(
      "linkedin",
      "LinkedIn profile URL",
      hasLinkedIn,
      hasLinkedIn ? 5 : 0,
      5,
      hasLinkedIn
        ? "LinkedIn URL present."
        : "No LinkedIn URL — recruiters cannot verify your profile.",
    ),
    check(
      "portfolio",
      "GitHub / portfolio link",
      hasGithubOrPortfolio,
      hasGithubOrPortfolio ? 5 : 0,
      5,
      hasGithubOrPortfolio
        ? "Verifiable code/portfolio link present."
        : "No GitHub or portfolio link — projects are unverifiable.",
    ),
  ];
  if (!hasEmail) blockers.push("No email address detected — ATS cannot process candidate.");
  if (words <= 80)
    blockers.push("Very little machine-readable text — resume is likely image-based or blank.");

  /* --- 2. Skills & JD Matching (30 max) --- */
  const hasCustomJd = Boolean(jobDescription && jobDescription.trim().length >= 5);
  const provenSkills = parsed.provenSkills;

  const highBarSignals = containsAny(evidenceText, [
    "distributed systems", "concurrency", "multithreading", "event-driven", "microservices",
    "kafka", "rabbitmq", "redis", "caching", "database indexing", "sharding", "connection pooling",
    "rate limiting", "jwt", "oauth", "sandboxed", "docker", "kubernetes", "grpc", "websockets",
    "ci/cd", "unit testing", "system design", "memory optimization", "p2p", "local embeddings",
    "rag", "vector search", "faiss", "multi-agent", "mcp", "leetcode", "codeforces", "hackathon",
    "patent", "research paper", "pypi", "npm package", "open source",
  ]);

  let kws: string[] = [];
  let matched: string[] = [];
  let missing: string[] = [];
  let jdScore: number | null = null;
  let bulletMatchedCount = 0;

  if (hasCustomJd) {
    kws = jdKeywords(jobDescription!);
    matched = kws.filter((k) => containsAny(text, [k]).length > 0);
    missing = kws.filter((k) => !matched.includes(k));
    const matchRatio = kws.length > 0 ? (matched.length / kws.length) : 1;
    bulletMatchedCount = matched.filter((m) => parsed.provenSkills.includes(m)).length;
    const bulletBonus = Math.min(15, bulletMatchedCount * 3);
    jdScore = Math.min(100, Math.max(15, Math.round(matchRatio * 85 + bulletBonus)));
  } else {
    // Global SDE Benchmark: Evaluation of technical skills & versatility
    const provenSkillScore = Math.min(30, provenSkills.length * 5 + skillsFound.length * 1.5);
    jdScore = Math.min(98, Math.max(30, provenSkillScore + (hasProofOfWork ? 10 : 5)));
    kws = skillsFound;
    matched = skillsFound;
    missing = [];
  }

  const skillChecks: AtsCheck[] = hasCustomJd
    ? [
        check(
          "jd-skills",
          "Target JD required skills & keywords match",
          matched.length >= Math.min(4, Math.ceil(kws.length * 0.35)),
          Math.min(
            15,
            kws.length
              ? (matched.length / kws.length) * 10 +
                  (matched.length ? (bulletMatchedCount / matched.length) * 5 : 0)
              : 15,
          ),
          15,
          `${matched.length}/${kws.length} JD keywords matched (${matched.slice(0, 8).join(", ")}${matched.length > 8 ? "…" : ""}). Missing: ${missing.slice(0, 5).join(", ") || "none"}.`,
        ),
        check(
          "skill-count",
          "Technical skills verified in project context",
          provenSkills.length >= 2,
          Math.min(10, provenSkills.length * 2.5 + Math.min(4, skillsFound.length * 0.5)),
          10,
          provenSkills.length > 0
            ? `${provenSkills.length} skills demonstrated in project/work bullets (${provenSkills.slice(0, 6).join(", ")}).`
            : `${skillsFound.length} technical skills found across resume.`,
        ),
        check(
          "tooling",
          "Modern frameworks, protocols & dev tooling",
          highBarSignals.length >= 1 || skillsFound.length >= 4,
          Math.min(5, Math.max(2, (highBarSignals.length * 2 + skillsFound.length * 0.5))),
          5,
          skillsFound.length > 0
            ? `${skillsFound.length} technical tools/technologies recognized.`
            : "No technical tools recognized.",
        ),
      ]
    : [
        check(
          "skill-breadth",
          "Core technical skills & technologies",
          skillsFound.length >= 4,
          Math.min(15, skillsFound.length * 2.5),
          15,
          `${skillsFound.length} technical skills identified (${skillsFound.slice(0, 8).join(", ")}).`,
        ),
        check(
          "skill-count",
          "Technical skills verified in project bullets",
          provenSkills.length >= 2,
          Math.min(10, provenSkills.length * 3),
          10,
          provenSkills.length > 0
            ? `${provenSkills.length} skills verified in project bullets (${provenSkills.slice(0, 6).join(", ")}).`
            : `${skillsFound.length} skills listed. Integrate tools directly into project bullets.`,
        ),
        check(
          "tooling",
          "Development, database & cloud tooling",
          highBarSignals.length >= 1 || skillsFound.length >= 3,
          Math.min(5, Math.max(2, highBarSignals.length * 2 + skillsFound.length * 0.5)),
          5,
          `${skillsFound.length} tools and technologies recognized.`,
        ),
      ];

  /* --- 3. Projects (At least 2 projects with good explanation) (25 max) --- */
  const projectEntriesCount = parsed.projectEntries.length;
  const hasProjectsSection = parsed.sections.some((s) => s.type === "projects");
  const projectBulletsCount = parsed.sections
    .filter((s) => s.type === "projects")
    .reduce((acc, s) => acc + s.lines.filter((l) => /^[-•*▪◦‣·–—>]/.test(l) || l.length > 30).length, 0);

  const hasAtLeastTwoProjects = projectEntriesCount >= 2 || (hasProjectsSection && projectBulletsCount >= 4);

  const projectChecks: AtsCheck[] = [
    check(
      "project-count",
      "At least 2 technical projects with good explanation",
      hasAtLeastTwoProjects,
      hasAtLeastTwoProjects
        ? 12
        : projectEntriesCount === 1 || projectBulletsCount >= 2
          ? 7
          : hasProjectsSection
            ? 4
            : 0,
      12,
      hasAtLeastTwoProjects
        ? `${projectEntriesCount >= 2 ? `${projectEntriesCount} distinct projects` : "Substantial project section"} detailed with explanation and stack.`
        : projectEntriesCount === 1
          ? "Only 1 project found. Add at least 2 well-explained technical projects."
          : "Missing dedicated projects section with detailed explanations.",
    ),
    check(
      "project-depth",
      "Project technical depth & measurable outcomes",
      quantifiedBullets >= 2 || hasProofOfWork,
      Math.min(8, Math.max(3, quantifiedBullets * 2 + (hasProofOfWork ? 3 : 0))),
      8,
      hasProofOfWork
        ? `${quantifiedBullets} quantified metrics with verifiable proof/links.`
        : `${quantifiedBullets} measurable outcomes and metrics in project descriptions.`,
    ),
    check(
      "project-verbs",
      "Action-oriented project descriptions",
      parsed.powerVerbCount >= 1 || parsed.standardVerbCount >= 2,
      Math.min(5, Math.max(2, parsed.powerVerbCount * 2 + parsed.standardVerbCount * 1)),
      5,
      `${parsed.powerVerbCount} power engineering verbs and ${parsed.standardVerbCount} standard action verbs opening bullets.`,
    ),
  ];

  /* --- 4. Experience with Dates (15 max) --- */
  const hasExpSection = parsed.sections.some((s) => s.type === "experience");
  const hasDates = hasDateRange(text);
  const expChecks: AtsCheck[] = [
    check(
      "dates",
      "Dated work / internship experience entries",
      hasDates,
      hasDates ? 7 : hasExpSection ? 3 : 0,
      7,
      hasDates
        ? "Explicit date ranges detected on experience entries."
        : "Missing explicit date ranges (e.g. 'Jun 2023 - Aug 2023' or '2024 - Present').",
    ),
    check(
      "exp-explanation",
      "Clear explanation of experience & responsibilities",
      hasExpSection || bullets.length >= 4,
      hasExpSection ? 8 : Math.min(8, bullets.length * 1.5),
      8,
      hasExpSection
        ? "Experience/internships section present with detailed responsibilities."
        : "Experience integrated within project and practical track record.",
    ),
  ];

  /* --- 5. Summary & Spelling / Typo Hygiene (10 max) --- */
  const hasSummary = parsed.sections.some((s) => s.type === "summary");
  const grammarAnalysis = analyzeGrammar(text);
  const spellingIssues = grammarAnalysis.issues.filter(
    (i) => i.type === "spelling" || i.type === "ocr" || i.type === "repetition",
  );

  const summaryAndTypoChecks: AtsCheck[] = [
    check(
      "summary",
      "Professional summary relevant to JD & role",
      hasSummary,
      hasSummary ? 4 : 2,
      4,
      hasSummary
        ? "Professional summary section present."
        : "No explicit summary section — adding a 2-3 line summary targeted to the JD enhances recruiter scannability.",
    ),
    check(
      "typos",
      "Spelling & middle-word typo cleanliness",
      spellingIssues.length === 0,
      Math.max(0, 6 - spellingIssues.length * 1.5),
      6,
      spellingIssues.length === 0
        ? "Spelling and typo check clean."
        : `${spellingIssues.length} spelling/typo issue(s) detected: ${spellingIssues.slice(0, 3).map((e) => e.error).join(", ")}.`,
    ),
  ];

  const categories: AtsCategory[] = [
    cat("parse", "Contact Details & Links", parse, 20),
    cat("skills", hasCustomJd ? "Skills & JD Matching" : "Core Technical Skills", skillChecks, 30),
    cat("projects", "Projects Depth (>= 2 Projects)", projectChecks, 25),
    cat("experience", "Experience with Dates", expChecks, 15),
    cat("hygiene", "Summary & Spelling Hygiene", summaryAndTypoChecks, 10),
  ];

  let score = Math.round(categories.reduce((s, c) => s + c.score, 0));

  /* --- Blocker Caps (Only for genuine showstoppers like missing email or empty document) --- */
  if (!hasEmail) {
    score = Math.min(score, 60);
  }
  if (words <= 80) {
    score = Math.min(score, 40);
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
      parsedDocument: parsed,
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
