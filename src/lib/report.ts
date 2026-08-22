/** In-browser exports: CSV (PapaParse), per-student PDF (jsPDF), markdown. */

import type { Analysis } from "./analysis-types";
import { effectiveScore } from "./analysis-types";

export type ExportRow = { fileName: string; analysis: Analysis };

/* --------------------------------- CSV ---------------------------------- */

export async function exportCsv(rows: ExportRow[], fileName = `placement-report-${stamp()}.csv`) {
  const Papa = (await import("papaparse")).default;

  // Sort descending by final score
  const sorted = [...rows].sort((a, b) => effectiveScore(b.analysis) - effectiveScore(a.analysis));

  const data = sorted.map(({ fileName: file, analysis: a }, idx) => {
    const score = effectiveScore(a);
    const issuesText = a.criticalIssues
      .map(
        (i, iIdx) =>
          `${iIdx + 1}. [${i.severity.toUpperCase()}] ${i.problem}${i.fix ? ` -> Fix: ${i.fix}` : ""}`,
      )
      .join("\n");
    const strengthsText = a.strengths.map((s, sIdx) => `${sIdx + 1}. ${s}`).join("\n");
    const projectsText = a.projectSuggestions.map((p, pIdx) => `${pIdx + 1}. ${p}`).join("\n");
    const rewriteSample =
      a.bulletRewrites.length > 0
        ? `Original: "${a.bulletRewrites[0]!.original}"\nRewritten: "${a.bulletRewrites[0]!.rewritten}"`
        : "";
    const atsPolish = [...a.formattingProblems, ...a.grammarAndOcrErrors]
      .filter(
        (msg) =>
          msg && !msg.toLowerCase().includes("wrong ->") && !msg.toLowerCase().includes("no error"),
      )
      .join("\n");

    return {
      Rank: idx + 1,
      "Candidate Name": a.candidateName,
      "File Name": file,
      "Final Score (0-100)": score,
      "Readiness Tier": a.readinessTier,
      "Target Role": a.role || a.assumedRole,
      "JD Match": a.jdScore !== null ? `${a.jdScore}%` : "—",
      "Recruiter 6-Sec Scan": a.recruiterFirstImpression || "—",
      "Placement Officer Verdict": a.hrVerdict || "—",
      "Verified Strengths": strengthsText || "None recorded",
      "Action Items & Fixes": issuesText || "0 critical issues",
      "Matched Skills": a.skillMatrix.matched.join(", ") || "—",
      "Missing Skills": a.skillMatrix.missing.join(", ") || "—",
      "Priority Tech to Learn":
        a.skillMatrix.recommended.join(", ") || a.techImprovementIdeas.join(", ") || "—",
      "Recommended Projects": projectsText || "—",
      "Sample Bullet Rewrite": rewriteSample || "—",
      "ATS Formatting & Typos": atsPolish || "Clean ATS format",
      "Officer Notes": a.officerNotes || "",
    };
  });

  const csvContent = Papa.unparse(data, {
    quotes: true,
    newline: "\r\n",
  });

  download(fileName, "\uFEFF" + csvContent, "text/csv;charset=utf-8;");
}

/* --------------------------------- PDF ---------------------------------- */

export async function exportScorecardPdf(fileName: string, a: Analysis) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const M = 44;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const BODY = W - M * 2;
  let y = M;

  const ensure = (needed = 16) => {
    if (y + needed > H - M) {
      doc.addPage();
      y = M;
    }
  };

  const text = (s: string, size = 10, style: "normal" | "bold" = "normal", indent = 0) => {
    if (!s) return;
    doc.setFont("helvetica", style).setFontSize(size).setTextColor(40);
    for (const line of doc.splitTextToSize(s, BODY - indent) as string[]) {
      ensure(size + 5);
      doc.text(line, M + indent, y);
      y += size + 4;
    }
  };

  const heading = (s: string) => {
    ensure(34);
    y += 10;
    doc.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(20);
    doc.text(s.toUpperCase(), M, y);
    y += 6;
    doc
      .setDrawColor(210)
      .setLineWidth(0.7)
      .line(M, y, M + BODY, y);
    y += 13;
  };

  const bullets = (items: string[], indent = 12) => {
    if (!items.length) {
      text("None reported.", 9.5, "normal", indent);
      return;
    }
    for (const item of items) {
      if (!item) continue;
      doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(45);
      const lines = doc.splitTextToSize(item, BODY - indent - 12) as string[];
      lines.forEach((line, i) => {
        ensure(15);
        if (i === 0) doc.text("\u2022", M + indent, y);
        doc.text(line, M + indent + 12, y);
        y += 13.5;
      });
      y += 2;
    }
  };

  const score = effectiveScore(a);
  const tone: [number, number, number] =
    score >= 75 ? [22, 130, 70] : score >= 55 ? [190, 130, 15] : [190, 45, 45];
  const [tr, tg, tb] = tone;

  // Header band
  doc.setFillColor(24, 28, 38).rect(0, 0, W, 96, "F");
  doc.setFont("helvetica", "bold").setFontSize(19).setTextColor(255);
  doc.text(a.candidateName || "Unnamed candidate", M, 42);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(196);
  doc.text(`${a.role || "—"}   ·   ${fileName}`, M, 61);
  doc.setFontSize(8.5).setTextColor(150);
  doc.text(`Generated ${new Date().toLocaleString()}`, M, 78);

  doc.setFont("helvetica", "bold").setFontSize(30).setTextColor(tr, tg, tb);
  doc.text(String(score), W - M, 48, { align: "right" });
  doc.setFontSize(8).setTextColor(190);
  doc.text("/ 100", W - M, 62, { align: "right" });

  y = 122;
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(tr, tg, tb);
  doc.text(a.readinessTier, M, y);
  y += 8;
  if (a.jdScore !== null) {
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(70);
    doc.text(`JD fit: ${a.jdScore}/100`, W - M, y - 8, { align: "right" });
  }
  if (a.manualScore !== null) {
    doc.setFont("helvetica", "italic").setFontSize(8.5).setTextColor(120);
    y += 12;
    doc.text(`Officer override applied (AI score was ${a.overallScore}).`, M, y);
  }
  y += 8;

  if (a.recruiterFirstImpression) {
    heading("Recruiter's 6-second impression");
    text(a.recruiterFirstImpression, 10.5, "normal");
  }
  if (a.hrVerdict) {
    heading("HR verdict");
    text(a.hrVerdict, 10.5, "normal");
  }

  // v2: evaluation framing + structure + data gaps + relevance
  if (a.evaluationBasis) {
    const basisLabel =
      a.evaluationBasis === "jd-fit"
        ? "Evaluated against the supplied job description"
        : `Evaluated against default role: ${a.assumedRole || "—"}`;
    text(basisLabel, 9, "bold");
  }
  if (a.structure && a.structure.score > 0) {
    heading("Resume structure & scannability");
    text(`Score: ${a.structure.score}/100 (${a.structure.label})`, 9.5, "bold");
    if (a.structure.notes.length) bullets(a.structure.notes);
  }
  if (a.dataGaps.length) {
    heading("Missing information (hurts shortlisting)");
    for (const g of a.dataGaps) {
      text(`${g.area}: ${g.missing}${g.impact ? ` — impact: ${g.impact}` : ""}`, 9.5, "normal", 12);
    }
  }
  if (a.relevance && a.relevance.verdict) {
    heading("Role relevance");
    if (a.relevance.assumedRole) text(`Basis role: ${a.relevance.assumedRole}`, 9.5, "bold");
    if (a.relevance.skillsMisaligned)
      text(
        "Warning: listed skills look disconnected from the project/experience shown.",
        9.5,
        "bold",
      );
    text(a.relevance.verdict, 10.5, "normal");
  }
  if (a.scoreBreakdown.length) {
    heading("Score breakdown");
    for (const row of a.scoreBreakdown) {
      ensure(30);
      doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(35);
      doc.text(row.category, M, y);
      doc.text(`${row.score}/${row.max}`, M + BODY, y, { align: "right" });
      y += 7;
      const pct = row.max > 0 ? Math.max(0, Math.min(1, row.score / row.max)) : 0;
      doc.setFillColor(232, 232, 232).rect(M, y, BODY, 4.5, "F");
      const bar: [number, number, number] =
        pct >= 0.75 ? [22, 130, 70] : pct >= 0.5 ? [190, 130, 15] : [190, 45, 45];
      doc.setFillColor(bar[0], bar[1], bar[2]);
      doc.rect(M, y, BODY * pct, 4.5, "F");
      y += 11;
      if (row.note) text(row.note, 8.5, "normal", 0);
      y += 3;
    }
  }

  if (a.criticalIssues.length) {
    heading("What is holding this resume back");
    for (const issue of a.criticalIssues) {
      ensure(40);
      doc.setFont("helvetica", "bold").setFontSize(9.5);
      const sev: [number, number, number] =
        issue.severity === "critical"
          ? [190, 45, 45]
          : issue.severity === "major"
            ? [190, 130, 15]
            : [95, 95, 95];
      doc.setTextColor(sev[0], sev[1], sev[2]);
      doc.text(`[${issue.severity.toUpperCase()}] ${issue.area}`, M, y);
      y += 13;
      text(issue.problem, 9.5, "normal", 12);
      if (issue.evidence) text(`Resume says: "${issue.evidence}"`, 8.5, "normal", 12);
      if (issue.fix) text(`Fix: ${issue.fix}`, 9.5, "bold", 12);
      y += 6;
    }
  }

  if (a.strengths.length) {
    heading("Strengths");
    bullets(a.strengths);
  }

  heading("Skill matrix");
  text("Matched", 10, "bold");
  bullets(a.skillMatrix.matched.length ? [a.skillMatrix.matched.join(", ")] : []);
  text("Missing", 10, "bold");
  bullets(a.skillMatrix.missing.length ? [a.skillMatrix.missing.join(", ")] : []);
  if (a.skillMatrix.recommended.length) {
    text("Learn next (highest hiring impact first)", 10, "bold");
    bullets(a.skillMatrix.recommended);
  }

  if (a.bulletRewrites.length) {
    heading("Rewrite these bullets");
    for (const r of a.bulletRewrites) {
      ensure(46);
      text("Before", 9, "bold", 12);
      text(r.original, 9.5, "normal", 24);
      text("After", 9, "bold", 12);
      doc.setTextColor(22, 130, 70);
      text(r.rewritten, 9.5, "normal", 24);
      if (r.reason) text(`Why: ${r.reason}`, 8.5, "normal", 24);
      y += 7;
    }
  }

  if (a.techImprovementIdeas.length) {
    heading("Technical improvement plan");
    bullets(a.techImprovementIdeas);
  }
  if (a.projectSuggestions.length) {
    heading("Projects that would move the needle");
    bullets(a.projectSuggestions);
  }
  if (a.grammarAndOcrErrors.length) {
    heading("Grammar, spelling & OCR errors");
    bullets(a.grammarAndOcrErrors);
  }
  if (a.formattingProblems.length) {
    heading("ATS formatting problems");
    bullets(a.formattingProblems);
  }
  if (a.officerNotes) {
    heading("Placement officer notes");
    text(a.officerNotes, 10, "normal");
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(150);
    doc.text(`Page ${p} of ${pages}`, W / 2, H - 22, { align: "center" });
  }

  doc.save(`${safeName(a.candidateName || fileName)}-scorecard.pdf`);
}

/* ------------------------------- markdown ------------------------------- */

export function toMarkdownReport(fileName: string, a: Analysis): string {
  const L: string[] = [
    `# ${a.candidateName} — ${effectiveScore(a)}/100`,
    ``,
    `**File:** ${fileName}  `,
    `**Target role:** ${a.role}  `,
    `**Readiness:** ${a.readinessTier}  `,
    a.jdScore !== null ? `**JD fit:** ${a.jdScore}/100 — ${a.jdVerdict}  ` : ``,
    ``,
  ];

  if (a.recruiterFirstImpression)
    L.push(`## Recruiter's 6-second impression`, a.recruiterFirstImpression, ``);
  if (a.hrVerdict) L.push(`## HR verdict`, a.hrVerdict, ``);

  if (a.evaluationBasis) {
    L.push(
      `## How this was evaluated`,
      a.evaluationBasis === "jd-fit"
        ? `Against the supplied job description.`
        : `Against the default role: ${a.assumedRole || "—"}.`,
      ``,
    );
  }
  if (a.structure && a.structure.score > 0) {
    L.push(
      `## Resume structure & scannability — ${a.structure.score}/100 (${a.structure.label})`,
      ...a.structure.notes.map((n) => `- ${n}`),
      ``,
    );
  }
  if (a.dataGaps.length) {
    L.push(`## Missing information`);
    a.dataGaps.forEach((g) =>
      L.push(`- **${g.area}:** ${g.missing}${g.impact ? ` — ${g.impact}` : ``}`),
    );
    L.push(``);
  }
  if (a.relevance && a.relevance.verdict) {
    L.push(
      `## Role relevance`,
      a.relevance.assumedRole ? `Basis role: ${a.relevance.assumedRole}` : ``,
      a.relevance.skillsMisaligned
        ? `Warning: listed skills look disconnected from the experience shown.`
        : ``,
      a.relevance.verdict,
      ``,
    );
  }

  if (a.scoreBreakdown.length) {
    L.push(`## Score breakdown`, ``, `| Category | Score | Note |`, `| --- | --- | --- |`);
    a.scoreBreakdown.forEach((r) => L.push(`| ${r.category} | ${r.score}/${r.max} | ${r.note} |`));
    L.push(``);
  }

  if (a.criticalIssues.length) {
    L.push(`## Issues to fix`);
    a.criticalIssues.forEach((i) =>
      L.push(
        `- **[${i.severity.toUpperCase()}] ${i.area}** — ${i.problem}`,
        i.evidence ? `  - Resume says: "${i.evidence}"` : ``,
        i.fix ? `  - Fix: ${i.fix}` : ``,
      ),
    );
    L.push(``);
  }

  const section = (title: string, items: string[]) => {
    if (items.length) L.push(`## ${title}`, ...items.map((s) => `- ${s}`), ``);
  };

  section("Strengths", a.strengths);
  L.push(
    `## Skill matrix`,
    `- **Matched:** ${a.skillMatrix.matched.join(", ") || "—"}`,
    `- **Missing:** ${a.skillMatrix.missing.join(", ") || "—"}`,
    `- **Learn next:** ${a.skillMatrix.recommended.join(", ") || "—"}`,
    ``,
  );

  if (a.bulletRewrites.length) {
    L.push(`## Bullet rewrites`);
    a.bulletRewrites.forEach((r) =>
      L.push(
        `- **Before:** ${r.original}`,
        `  - **After:** ${r.rewritten}`,
        r.reason ? `  - Why: ${r.reason}` : ``,
      ),
    );
    L.push(``);
  }

  section("Technical improvement plan", a.techImprovementIdeas);
  section("Project suggestions", a.projectSuggestions);
  section("Grammar / OCR errors", a.grammarAndOcrErrors);
  section("ATS formatting problems", a.formattingProblems);
  if (a.officerNotes) L.push(`## Officer notes`, a.officerNotes, ``);

  return L.filter((l) => l !== ``)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function exportBatchMarkdown(rows: ExportRow[]) {
  const md = rows.map((r) => toMarkdownReport(r.fileName, r.analysis)).join("\n\n---\n\n");
  download(`resume-batch-${stamp()}.md`, md, "text/markdown");
}

/* -------------------------------- helpers -------------------------------- */

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

function safeName(s: string) {
  return (
    s
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "candidate"
  );
}

export function download(fileName: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadText = download;
