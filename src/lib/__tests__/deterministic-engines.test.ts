import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeResumeText } from "../sanitize";
import { runAtsEngine } from "../ats-engine";
import { normalizeAnalysis, createRuleBasedAnalysis } from "../analysis-types";

describe("Deterministic Engines Unit Tests", () => {
  describe("sanitizeResumeText", () => {
    it("repairs smart quotes, ligatures, and normalizes line endings", () => {
      const input = "Experienced \uFB01nancial analyst with \u201Cstrong\u201D skills\r\nin Python\u2013Django.";
      const { clean, fixes } = sanitizeResumeText(input);
      assert.ok(clean.includes("financial"));
      assert.ok(clean.includes('"strong"'));
      assert.ok(clean.includes("Python-Django"));
      assert.ok(fixes.length > 0);
    });

    it("retains key technical terms and section headings", () => {
      const sample = `
        JOHN DOE
        Software Engineer | john@example.com | github.com/johndoe
        
        EXPERIENCE
        Senior Software Engineer - TechCorp (2022 - Present)
        * Architected microservices with Node.js and PostgreSQL reducing latency by 40%.
        
        EDUCATION
        B.Tech in Computer Science - University of Engineering
      `;
      const { clean } = sanitizeResumeText(sample);
      assert.ok(clean.includes("JOHN DOE"));
      assert.ok(clean.includes("TechCorp"));
      assert.ok(clean.includes("reducing latency by 40%"));
    });
  });

  describe("runAtsEngine", () => {
    it("produces deterministic score and report structure", () => {
      const text = `
        JANE SMITH
        jane@example.com | 555-0199 | github.com/janesmith
        
        TECHNICAL SKILLS
        Languages: JavaScript, TypeScript, Python, SQL
        Frameworks: React, Node.js, Express, Next.js
        Databases: PostgreSQL, MongoDB, Redis
        
        EXPERIENCE
        Full Stack Developer Intern - Acme Inc (06/2023 - 12/2023)
        * Engineered real-time dashboard using React and WebSockets serving 10,000+ daily active users.
        * Reduced database query execution time by 35% through indexing and query optimization.
        
        PROJECTS
        Distributed Key-Value Store (01/2023 - 04/2023)
        * Built raft consensus storage engine in Go with 95% unit test coverage.
        
        EDUCATION
        Bachelor of Science in Computer Engineering (2020 - 2024)
      `;
      const report = runAtsEngine(text);
      assert.ok(report.score > 60);
      assert.ok(report.metrics.words > 50);
      assert.ok(report.metrics.skillsFound.includes("JavaScript"));
      assert.ok(report.categories.length > 0);
    });
  });

  describe("normalizeAnalysis & createRuleBasedAnalysis", () => {
    it("creates valid fallback Analysis when LLM fails or is in rule-based mode", () => {
      const text = "Sample candidate text with Node.js and React";
      const ats = runAtsEngine(text);
      const analysis = createRuleBasedAnalysis(ats, "resume.pdf", text);

      assert.ok(analysis.candidateName);
      assert.equal(analysis.overallScore, ats.score);
      assert.equal(analysis.isRuleBasedFallback, true);
      assert.equal(analysis.scoreBreakdown.length, 6);
    });

    it("coerces raw LLM payloads defensively without crashing", () => {
      const malformedPayload = {
        candidate_name: "Test Candidate",
        overall_score: "85",
        score_breakdown: "not an array",
      };
      const ats = runAtsEngine("Test resume text");
      const normalized = normalizeAnalysis(malformedPayload, ats, "Test resume text");

      assert.equal(normalized.candidateName, "Test Candidate");
      assert.equal(normalized.overallScore, 85);
      assert.ok(Array.isArray(normalized.scoreBreakdown));
    });
  });
});
