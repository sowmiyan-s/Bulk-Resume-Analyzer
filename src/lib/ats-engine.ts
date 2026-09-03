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
    id: "summary",
    label: "Summary / Objective",
    re: /\b(professional\s+|career\s+|executive\s+)?(summary|profile|objective|about\s+me|overview)\b/i,
    required: false,
  },
  {
    id: "skills",
    label: "Skills",
    re: /\b(technical\s+|core\s+|key\s+|computer\s+|programming\s+)?(skills?|skillset|skill-set|technologies|tech\s+stack|competencies|proficiencies|languages\s*(&|and)\s*frameworks)\b/i,
    required: true,
  },
  {
    id: "experience",
    label: "Experience / Internships",
    re: /\b(work\s+|professional\s+|job\s+|practical\s+|relevant\s+|industrial\s+)?(experience|employment|internships?|work\s+history|job\s+history|training)\b/i,
    required: true,
  },
  {
    id: "education",
    label: "Education",
    re: /\b(educational\s+|academic\s+|scholastic\s+)?(education|qualifications?|background|academics|degrees?)\b/i,
    required: true,
  },
  {
    id: "projects",
    label: "Projects",
    re: /\b(personal\s+|academic\s+|key\s+|technical\s+|selected\s+|notable\s+|major\s+|mini\s+|capstone\s+)?(projects?|project\s+work|initiatives)\b/i,
    required: true,
  },
  {
    id: "certifications",
    label: "Certifications",
    re: /\b(certifications?|certificates?|licenses?|accreditations?|courses|trainings?\s*(&|and)\s*certifications?)\b/i,
    required: false,
  },
  {
    id: "achievements",
    label: "Achievements",
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
    if (line.length > 55 || /^[-•*▪◦‣·–—>\d.]\s/.test(line)) {
      return { isHeader: false, type: "other", title: "" };
    }
    const clean = line.replace(/^[#•\-\*|>:\s]+|[#•\-\*|>:\s]+$/g, "").trim();
    if (!clean) return { isHeader: false, type: "other", title: "" };

    if (/\b(professional\s+|career\s+|executive\s+)?(summary|profile|objective|about\s+me|overview)\b/i.test(clean)) {
      return { isHeader: true, type: "summary", title: clean };
    }
    if (/\b(technical\s+|core\s+|key\s+|computer\s+|programming\s+)?(skills?|skillset|skill-set|technologies|tech\s+stack|competencies|proficiencies|languages\s*(&|and)\s*frameworks)\b/i.test(clean)) {
      return { isHeader: true, type: "skills", title: clean };
    }
    if (/\b(work\s+|professional\s+|job\s+|practical\s+|relevant\s+|industrial\s+)?(experience|employment|internships?|work\s+history|job\s+history|training)\b/i.test(clean)) {
      return { isHeader: true, type: "experience", title: clean };
    }
    if (/\b(educational\s+|academic\s+|scholastic\s+)?(education|qualifications?|background|academics|degrees?)\b/i.test(clean)) {
      return { isHeader: true, type: "education", title: clean };
    }
    if (/\b(personal\s+|academic\s+|key\s+|technical\s+|selected\s+|notable\s+|major\s+|mini\s+|capstone\s+)?(projects?|project\s+work|initiatives)\b/i.test(clean)) {
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
  const requiredHit = requiredSections.filter((s) => parsed.sections.some((sec) => sec.type === s.id)).length;
  const optionalHit = SECTION_PATTERNS.filter((s) => !s.required && parsed.sections.some((sec) => sec.type === s.id)).length;
  const structureChecks: AtsCheck[] = [
    check(
      "req-sections",
      "Standard ATS section headings",
      requiredHit >= requiredSections.length - 1,
      Math.min(12, (requiredHit / Math.max(1, requiredSections.length - 1)) * 12),
      12,
      `${requiredHit}/${requiredSections.length} core sections recognized (${sectionsFound.slice(0, 4).join(", ")}). Missing: ${
        requiredSections
          .filter((s) => !parsed.sections.some((sec) => sec.type === s.id))
          .map((s) => s.label)
          .join(", ") || "none"
      }`,
    ),
    check(
      "opt-sections",
      "Supporting sections (certs / achievements / summary)",
      optionalHit >= 1,
      Math.min(4, Math.max(2, optionalHit * 2)),
      4,
      `${optionalHit}/3 supporting sections present.`,
    ),
    check(
      "dates",
      "Dated experience entries",
      hasDateRange(text),
      hasDateRange(text) ? 4 : 0,
      4,
      hasDateRange(text)
        ? "Clear date ranges detected on experience entries."
        : "Missing explicit date spans (e.g. '2023 - Present' or 'Jun 2022 - May 2024') on experience/education entries.",
    ),
  ];
  if (requiredHit < 3) {
    blockers.push(
      "Multiple standard core sections missing — keyword parsers will mis-file your content.",
    );
  }

  /* --- 3. Impact & writing quality (25) --- */
  const quantRatio = bullets.length ? quantifiedBullets / bullets.length : 0;
  const weakHits = containsAny(text, WEAK_PHRASES);
  const firstPerson = (text.match(/\b(I|my|me)\b/g) ?? []).length;

  // Qualification & Measurable Impact:
  // Overwhelmed resumes (e.g. >15 bullets with <15% metrics) get heavily penalized for lack of verifiable proof
  let quantScore = 0;
  if (bullets.length === 0) {
    quantScore = 0;
  } else if (bullets.length <= 6) {
    quantScore = Math.min(10, quantifiedBullets * 4 + (hasProofOfWork ? 2 : 0));
  } else {
    // Standard / High-bullet resume: ratio drives the score
    const baseRatioScore = Math.min(8, Math.round(quantRatio * 22));
    const bonusProof = hasProofOfWork ? 2 : 0;
    quantScore = Math.min(10, Math.max(1, baseRatioScore + bonusProof));
  }

  const verbScore = Math.min(
    6,
    Math.max(
      0,
      ((parsed.powerVerbCount * 1.0 + parsed.standardVerbCount * 0.6) / Math.max(1, bullets.length * 0.7)) * 6 -
        parsed.weakVerbBullets.length * 0.8,
    ),
  );

  const impact: AtsCheck[] = [
    check(
      "bullets",
      "Uses bullet points",
      bullets.length >= 6,
      Math.min(5, bullets.length * 0.5),
      5,
      `${bullets.length} bullet points detected across project & experience sections.`,
    ),
    check(
      "quantified",
      "Quantified achievements & verifiable proof",
      quantRatio >= 0.25 || (bullets.length <= 6 && quantifiedBullets >= 2 && hasProofOfWork),
      quantScore,
      10,
      hasProofOfWork
        ? `${quantifiedBullets}/${bullets.length || 0} bullets with metrics (${Math.round(quantRatio * 100)}% density) + verifiable published artifacts/proof.`
        : `${quantifiedBullets}/${bullets.length || 0} bullets contain measurable outcomes (${Math.round(quantRatio * 100)}% density).`,
    ),
    check(
      "verbs",
      "Bullets start with strong action verbs",
      parsed.powerVerbCount >= 2 && parsed.weakVerbBullets.length === 0,
      verbScore,
      6,
      parsed.weakVerbBullets.length > 0
        ? `${parsed.powerVerbCount} power engineering verbs, but ${parsed.weakVerbBullets.length} passive phrase(s) detected (${parsed.weakVerbBullets.slice(0, 2).map((b) => '"' + b.slice(0, 30) + '…"').join(", ")}).`
        : `${parsed.powerVerbCount} power engineering verbs and ${parsed.standardVerbCount} standard action verbs opening bullets.`,
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
  const hasCustomJd = Boolean(jobDescription && jobDescription.trim().length >= 5);
  const provenSkills = parsed.provenSkills;
  const isKeywordStuffed = skillsFound.length >= 12 && provenSkills.length <= 2;
  if (isKeywordStuffed) {
    blockers.push(`Keyword stuffing detected: ${skillsFound.length} technical skills listed, but only ${provenSkills.length} applied in project bullets.`);
  }

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
    // JD coverage is evidence weighted: a keyword in a Skills list is weaker
    // than the same keyword demonstrated in a project or experience bullet.
    const matchRatio = kws.length > 0 ? (matched.length / kws.length) : 1;
    bulletMatchedCount = matched.filter((m) => parsed.provenSkills.includes(m)).length;
    const bulletBonus = Math.min(12, bulletMatchedCount * 2.5);
    jdScore = Math.min(100, Math.max(10, Math.round(matchRatio * 88 + bulletBonus)));
  } else {
    // Global SDE Benchmark: Realistic 0-100 evaluation of technical depth, stack versatility, and engineering impact
    const provenSkillScore = Math.min(25, provenSkills.length * 4);
    const listedSkillScore = isKeywordStuffed ? 4 : Math.min(15, skillsFound.length * 1.5);
    const skillBreadthScore = provenSkillScore + listedSkillScore;
    const provenBulletScore = Math.min(30, (parsed.powerVerbCount * 3) + Math.round(quantRatio * 40));
    const advancedSignalScore = Math.min(20, highBarSignals.length * 4);
    const baselineBonus = hasProofOfWork ? 10 : 5;
    const rawJd = skillBreadthScore + provenBulletScore + advancedSignalScore + baselineBonus;
    jdScore = Math.min(98, Math.max(25, isKeywordStuffed ? rawJd - 15 : rawJd));
    kws = skillsFound;
    matched = skillsFound;
    missing = []; // Do NOT fabricate arbitrary missing skills when no JD was provided
  }

  const skillChecks: AtsCheck[] = hasCustomJd
    ? [
        check(
          "jd-skills",
          "Target JD required skills & keywords match",
          matched.length >= Math.min(5, Math.ceil(kws.length * 0.4)) &&
            (bulletMatchedCount >= 1 || matched.length < 3),
          Math.min(
            10,
            kws.length
              ? (matched.length / kws.length) * 6 +
                  (matched.length ? (bulletMatchedCount / matched.length) * 4 : 0)
              : 10,
          ),
          10,
          `${matched.length}/${kws.length} JD keywords matched (${matched.slice(0, 8).join(", ")}${matched.length > 8 ? "…" : ""}). Missing: ${missing.slice(0, 5).join(", ") || "none"}.`,
        ),
        check(
          "skill-count",
          "Technical skills applied in project context",
          provenSkills.length >= 2,
          Math.min(5, provenSkills.length * 1.5 + Math.min(2, skillsFound.length * 0.25)),
          5,
          provenSkills.length > 0
            ? `${provenSkills.length} skills verified in project bullets (${provenSkills.slice(0, 5).join(", ")}).`
            : `${skillsFound.length} technical skills found across resume.`,
        ),
        check(
          "architecture-depth",
          "Target role tooling & engineering proof",
          highBarSignals.length >= 1 || matched.length >= 4,
          Math.min(5, Math.max(2, (highBarSignals.length + (matched.length >= 4 ? 2 : 0)) * 1.5)),
          5,
          highBarSignals.length > 0
            ? `${highBarSignals.length} production signals detected (${highBarSignals.slice(0, 4).join(", ")}).`
            : "No production architecture signals detected.",
        ),
      ]
    : [
        check(
          "skill-count",
          "Technical skills verified in project bullets",
          provenSkills.length >= 3 && !isKeywordStuffed,
          Math.min(8, provenSkills.length * 1.8 + (isKeywordStuffed ? 0 : Math.min(2, skillsFound.length * 0.2))),
          8,
          provenSkills.length > 0
            ? `${provenSkills.length} skills verified in project bullets (${provenSkills.slice(0, 6).join(", ")}) out of ${skillsFound.length} recognized tools.${isKeywordStuffed ? " Overwhelmed skills list without project proof." : ""}`
            : `${skillsFound.length} skills listed, but none verified in project/work bullets. Integrate tools into project descriptions.`,
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
          containsAny(evidenceText, [
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
            containsAny(evidenceText, [
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
          `${containsAny(evidenceText, ["aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "jenkins", "github actions", "pytest", "jest", "junit", "terraform", "git"]).length} delivery/testing tools demonstrated in experience or projects.`,
        ),
      ];

  /* --- 5. Length & formatting hygiene (15) --- */
  const grammarAnalysis = analyzeGrammar(text);
  const tooLong = longestBulletWords > 45;
  const overwhelmedBullets = bullets.length > 20 && quantRatio < 0.15;
  if (overwhelmedBullets) {
    blockers.push(`Overwhelmed structure: ${bullets.length} bullets with only ${Math.round(quantRatio * 100)}% quantified outcomes. Uncalibrated text triggers recruiter fatigue.`);
  }
  const hasTableChars = hasTableLayout(lines);
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
    cat("skills", hasCustomJd ? "JD Skills & Competencies" : "Skills & Keyword Coverage", skillChecks, 20),
    cat("format", "Formatting Hygiene", fmt, 15),
  ];

  let score = Math.round(categories.reduce((s, c) => s + c.score, 0));

  /* --- Final JD score blending --- */
  if (hasCustomJd && jdScore !== null) {
    score = Math.round(score * 0.6 + jdScore * 0.4);
    if (jdScore < 35) {
      blockers.push(`Low JD alignment: only ${jdScore}% of required job description keywords found.`);
    }
  }

  /* --- Hard Blockers & Structural Overhaul Penalties --- */
  if (blockers.length > 0) {
    const penalty = Math.min(30, blockers.length * 10);
    score = Math.max(20, score - penalty);
    // Candidates with severe blockers (overwhelmed bullets, keyword stuffing, 45+ word bullet, missing core sections)
    // CANNOT pass as Tier 1 or high Tier 2. Their score is capped at 64 (Tier 3 Overhaul Required).
    const isSevere = blockers.length >= 2 || tooLong || !hasEmail || requiredHit < 3 || isKeywordStuffed;
    if (isSevere) {
      score = Math.min(64, score);
    } else {
      score = Math.min(74, score);
    }
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
