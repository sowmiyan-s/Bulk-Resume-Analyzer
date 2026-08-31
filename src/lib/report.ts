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
      "Fit Score": `${typeof a.jdScore === "number" ? a.jdScore : Math.max(0, Math.min(100, Math.round(score * 0.88)))}%`,
      "Evaluation Standard": a.evaluationBasis === "jd-fit" ? "Custom JD" : "Global SDE Benchmark",
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

  const M = 40;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const BODY = W - M * 2;
  let y = M;

  const score = effectiveScore(a);
  const tone: [number, number, number] =
    score >= 75 ? [16, 149, 103] : score >= 55 ? [217, 119, 6] : [220, 38, 38];
  const [tr, tg, tb] = tone;

  const drawPageHeader = (pageNum: number) => {
    if (pageNum > 1) {
      doc.setFillColor(248, 250, 252).rect(0, 0, W, 36, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.8).line(0, 36, W, 36);
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(71, 85, 105);
      doc.text(`${a.candidateName || "Candidate"} — Placement Audit Report`, M, 22);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(148, 163, 184);
      doc.text(`Score: ${score}/100`, W - M, 22, { align: "right" });
    }
  };

  const ensure = (needed = 20) => {
    if (y + needed > H - M - 20) {
      doc.addPage();
      drawPageHeader(doc.getNumberOfPages());
      y = 52;
    }
  };

  const heading = (title: string, needed = 28) => {
    ensure(needed);
    doc.setFillColor(241, 245, 249).rect(M, y, BODY, 18, "F");
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(15, 23, 42);
    doc.text(title.toUpperCase(), M + 8, y + 13);
    y += 24;
  };

  const textBlock = (
    s: string,
    size = 9,
    style: "normal" | "bold" | "italic" = "normal",
    color: [number, number, number] = [51, 65, 85],
    indent = 0,
  ) => {
    if (!s) return;
    doc.setFont("helvetica", style).setFontSize(size).setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(s, BODY - indent) as string[];
    for (const line of lines) {
      ensure(size + 6);
      doc.text(line, M + indent, y);
      y += size + 4;
    }
  };

  const bulletList = (items: string[], indent = 12) => {
    if (!items.length) {
      textBlock("None reported.", 9, "italic", [148, 163, 184], indent);
      return;
    }
    for (const item of items) {
      if (!item) continue;
      ensure(18);
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(tr, tg, tb);
      doc.text("\u2022", M + indent, y);
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(item, BODY - indent - 14) as string[];
      lines.forEach((line, i) => {
        if (i > 0) ensure(14);
        doc.text(line, M + indent + 12, y);
        y += 13;
      });
      y += 2;
    }
  };

  // ================= 1. EXECUTIVE HEADER BANNER =================
  doc.setFillColor(15, 23, 42).rect(0, 0, W, 105, "F");

  // Candidate Name & Role
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(255, 255, 255);
  doc.text(a.candidateName || "Unnamed Candidate", M, 36);

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(203, 213, 225);
  doc.text(`${a.role || "Software Engineering"} · ${fileName}`, M, 54);

  doc.setFontSize(8).setTextColor(148, 163, 184);
  const evalDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  doc.text(`Placement Evaluation · Generated ${evalDate}`, M, 70);

  // Evaluation basis pill in header
  if (a.evaluationBasis) {
    const basisText =
      a.evaluationBasis === "jd-fit"
        ? `JD-Aligned Assessment`
        : `Global SDE Standard Benchmark`;
    doc.setFillColor(30, 41, 59).roundedRect(M, 80, 190, 14, 3, 3, "F");
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(148, 163, 184);
    doc.text(basisText, M + 8, 90);
  }

  // Right Score Card in Header
  const scoreBoxW = 100;
  const scoreBoxX = W - M - scoreBoxW;
  doc.setFillColor(30, 41, 59).roundedRect(scoreBoxX, 18, scoreBoxW, 72, 6, 6, "F");

  doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(tr, tg, tb);
  doc.text(String(score), scoreBoxX + scoreBoxW / 2, 48, { align: "center" });

  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(148, 163, 184);
  doc.text("OUT OF 100", scoreBoxX + scoreBoxW / 2, 59, { align: "center" });

  const isJd = a.evaluationBasis === "jd-fit";
  const jdMatchPct =
    typeof a.jdScore === "number" ? a.jdScore : Math.max(0, Math.min(100, Math.round(score * 0.88)));
  doc.setFillColor(tr, tg, tb).roundedRect(scoreBoxX + 6, 65, scoreBoxW - 12, 14, 3, 3, "F");
  doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(255, 255, 255);
  doc.text(
    isJd ? `JD Match: ${jdMatchPct}%` : `SDE Fit: ${jdMatchPct}%`,
    scoreBoxX + scoreBoxW / 2,
    75,
    { align: "center" },
  );

  y = 120;

  // Tier Badge Bar
  doc.setFillColor(score >= 75 ? 240 : score >= 55 ? 254 : 254, score >= 75 ? 253 : score >= 55 ? 243 : 242, score >= 75 ? 244 : score >= 55 ? 199 : 242).roundedRect(M, y, BODY, 24, 4, 4, "F");
  doc.setDrawColor(tr, tg, tb).setLineWidth(0.8).roundedRect(M, y, BODY, 24, 4, 4, "S");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(tr, tg, tb);
  doc.text(a.readinessTier, M + 12, y + 16);
  if (a.manualScore !== null) {
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(100, 116, 139);
    doc.text(`(Manual Override Applied: AI Score ${a.overallScore})`, W - M - 12, y + 16, { align: "right" });
  }
  y += 34;

  // ================= 2. RECRUITER & HR VERDICTS =================
  if (a.recruiterFirstImpression || a.hrVerdict) {
    heading("Recruiter & Placement Committee Verdict");
    if (a.recruiterFirstImpression) {
      ensure(38);
      doc.setFillColor(248, 250, 252).roundedRect(M, y, BODY, 32, 4, 4, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(M, y, BODY, 32, 4, 4, "S");
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(71, 85, 105);
      doc.text("6-SECOND RECRUITER SCAN:", M + 10, y + 13);
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(30, 41, 59);
      const impLines = doc.splitTextToSize(a.recruiterFirstImpression, BODY - 20) as string[];
      doc.text(impLines[0] || "", M + 10, y + 25);
      y += 38;
    }
    if (a.hrVerdict) {
      ensure(38);
      doc.setFillColor(248, 250, 252).roundedRect(M, y, BODY, 32, 4, 4, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(M, y, BODY, 32, 4, 4, "S");
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(71, 85, 105);
      doc.text("PLACEMENT VERDICT & HIRING RECOMMENDATION:", M + 10, y + 13);
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(30, 41, 59);
      const vLines = doc.splitTextToSize(a.hrVerdict, BODY - 20) as string[];
      doc.text(vLines[0] || "", M + 10, y + 25);
      y += 38;
    }
  }

  // ================= 3. DETERMINISTIC ATS METRICS GRID =================
  if (a.ats) {
    heading("ATS Engine Audit & Technical Metrics");
    const m = a.ats.metrics;

    // 4 metric cards
    ensure(42);
    const cardW = (BODY - 24) / 4;
    const cards = [
      { label: "Word Count", val: `${m.words} words`, sub: `≈ ${m.estimatedPages} page(s)` },
      { label: "Bullet Points", val: `${m.bullets}`, sub: `avg ${m.readabilityWordsPerBullet} w/bullet` },
      { label: "Quantified Impact", val: `${m.quantifiedBullets}/${m.bullets || 1}`, sub: `${m.bullets ? Math.round((m.quantifiedBullets / m.bullets) * 100) : 0}% measurable` },
      { label: "Action Verbs", val: `${m.actionVerbBullets}/${m.bullets || 1}`, sub: `${m.bullets ? Math.round((m.actionVerbBullets / m.bullets) * 100) : 0}% strong starts` },
    ];

    cards.forEach((c, idx) => {
      const cx = M + idx * (cardW + 8);
      doc.setFillColor(248, 250, 252).roundedRect(cx, y, cardW, 36, 4, 4, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(cx, y, cardW, 36, 4, 4, "S");
      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(100, 116, 139);
      doc.text(c.label.toUpperCase(), cx + 8, y + 11);
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(15, 23, 42);
      doc.text(c.val, cx + 8, y + 23);
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(148, 163, 184);
      doc.text(c.sub, cx + 8, y + 32);
    });
    y += 44;

    // ATS Category Progress Bars
    for (const cat of a.ats.categories) {
      ensure(22);
      const catPct = cat.max > 0 ? Math.max(0, Math.min(1, cat.score / cat.max)) : 0;
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(51, 65, 85);
      doc.text(cat.label, M, y);
      doc.text(`${cat.score}/${cat.max} pts`, M + BODY, y, { align: "right" });
      y += 5;

      doc.setFillColor(226, 232, 240).roundedRect(M, y, BODY, 4, 2, 2, "F");
      const cTone: [number, number, number] =
        catPct >= 0.75 ? [16, 149, 103] : catPct >= 0.5 ? [217, 119, 6] : [220, 38, 38];
      doc.setFillColor(cTone[0], cTone[1], cTone[2]).roundedRect(M, y, BODY * catPct, 4, 2, 2, "F");
      y += 12;
    }
  }

  // ================= 4. CRITICAL ISSUES & BLOCKERS =================
  if (a.criticalIssues.length || (a.ats?.blockers && a.ats.blockers.length > 0)) {
    heading("Critical Resume Blockers & Actionable Fixes");

    if (a.ats?.blockers && a.ats.blockers.length > 0) {
      for (const b of a.ats.blockers) {
        ensure(24);
        doc.setFillColor(254, 242, 242).roundedRect(M, y, BODY, 20, 3, 3, "F");
        doc.setDrawColor(254, 202, 202).setLineWidth(0.5).roundedRect(M, y, BODY, 20, 3, 3, "S");
        doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(220, 38, 38);
        doc.text("⚠️ ATS HARD BLOCKER:", M + 8, y + 13);
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(127, 29, 29);
        const bText = doc.splitTextToSize(b, BODY - 130) as string[];
        doc.text(bText[0] || "", M + 120, y + 13);
        y += 24;
      }
    }

    for (const issue of a.criticalIssues) {
      ensure(52);
      const isCrit = issue.severity === "critical";
      const isMaj = issue.severity === "major";
      const badgeBg: [number, number, number] = isCrit ? [254, 242, 242] : isMaj ? [254, 243, 199] : [241, 245, 249];
      const badgeText: [number, number, number] = isCrit ? [220, 38, 38] : isMaj ? [180, 83, 9] : [71, 85, 105];

      doc.setFillColor(badgeBg[0], badgeBg[1], badgeBg[2]).roundedRect(M, y, BODY, 46, 4, 4, "F");
      doc.setDrawColor(badgeText[0], badgeText[1], badgeText[2]).setLineWidth(0.5).roundedRect(M, y, BODY, 46, 4, 4, "S");

      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(badgeText[0], badgeText[1], badgeText[2]);
      doc.text(`[${issue.severity.toUpperCase()}] ${issue.area}`, M + 10, y + 12);

      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(30, 41, 59);
      const pLines = doc.splitTextToSize(issue.problem, BODY - 20) as string[];
      doc.text(pLines[0] || "", M + 10, y + 24);

      if (issue.fix) {
        doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(16, 149, 103);
        const fixLines = doc.splitTextToSize(`Action: ${issue.fix}`, BODY - 20) as string[];
        doc.text(fixLines[0] || "", M + 10, y + 36);
      }
      y += 52;
    }
  }

  // ================= 5. SKILL MATRIX & TECH STACK =================
  heading("Technical Skills & Placement Gap Analysis");

  if (a.skillMatrix.matched.length) {
    ensure(20);
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(16, 149, 103);
    doc.text("✓ Verified Technical Skills Found in Resume:", M, y);
    y += 12;
    textBlock(a.skillMatrix.matched.join(" · "), 8.5, "normal", [51, 65, 85], 10);
    y += 4;
  }

  if (a.skillMatrix.missing.length) {
    ensure(20);
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(220, 38, 38);
    doc.text("✗ Missing Target Role / JD Keywords:", M, y);
    y += 12;
    textBlock(a.skillMatrix.missing.join(" · "), 8.5, "normal", [127, 29, 29], 10);
    y += 4;
  }

  if (a.skillMatrix.recommended.length) {
    ensure(20);
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(217, 119, 6);
    doc.text("⚡ Highest Placement Impact Skills to Acquire Next:", M, y);
    y += 12;
    textBlock(a.skillMatrix.recommended.join(" · "), 8.5, "normal", [120, 53, 15], 10);
    y += 6;
  }

  // ================= 6. BULLET REWRITES =================
  if (a.bulletRewrites.length) {
    heading("Actionable Bullet Point Transformations");
    for (const r of a.bulletRewrites) {
      ensure(58);
      doc.setFillColor(248, 250, 252).roundedRect(M, y, BODY, 54, 4, 4, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(M, y, BODY, 54, 4, 4, "S");

      // Before
      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(220, 38, 38);
      doc.text("BEFORE (WEAK):", M + 10, y + 12);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
      const bLines = doc.splitTextToSize(r.original, BODY - 100) as string[];
      doc.text(bLines[0] || "", M + 90, y + 12);

      // After
      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(16, 149, 103);
      doc.text("AFTER (IMPACT):", M + 10, y + 26);
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(15, 23, 42);
      const aLines = doc.splitTextToSize(r.rewritten, BODY - 100) as string[];
      doc.text(aLines[0] || "", M + 90, y + 26);

      // Rationale
      if (r.reason) {
        doc.setFont("helvetica", "italic").setFontSize(7.5).setTextColor(71, 85, 105);
        const rLines = doc.splitTextToSize(`Why: ${r.reason}`, BODY - 20) as string[];
        doc.text(rLines[0] || "", M + 10, y + 42);
      }
      y += 60;
    }
  }

  // ================= 7. IMPROVEMENT PLAN & SUGGESTIONS =================
  if (a.techImprovementIdeas.length || a.projectSuggestions.length) {
    heading("Placement Enhancement Roadmap");
    if (a.techImprovementIdeas.length) {
      ensure(16);
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(30, 41, 59);
      doc.text("Key Technical Upgrades:", M, y);
      y += 12;
      bulletList(a.techImprovementIdeas, 8);
    }
    if (a.projectSuggestions.length) {
      ensure(16);
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(30, 41, 59);
      doc.text("Recommended Portfolio Projects:", M, y);
      y += 12;
      bulletList(a.projectSuggestions, 8);
    }
  }

  // ================= FOOTER & PAGE NUMBERS =================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240).setLineWidth(0.5).line(M, H - 28, W - M, H - 28);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(148, 163, 184);
    doc.text("VSB Placement Cell · AI & Deterministic Resume Intelligence", M, H - 16);
    doc.text(`Page ${p} of ${totalPages}`, W - M, H - 16, { align: "right" });
  }

  doc.save(`${safeName(a.candidateName || fileName)}-placement-audit.pdf`);
}

/* ------------------------------- markdown ------------------------------- */

export function toMarkdownReport(fileName: string, a: Analysis): string {
  const L: string[] = [
    `# ${a.candidateName} — ${effectiveScore(a)}/100`,
    ``,
    `**File:** ${fileName}  `,
    `**Target role:** ${a.role}  `,
    `**Readiness:** ${a.readinessTier}  `,
    `**JD fit:** ${typeof a.jdScore === "number" ? a.jdScore : Math.max(0, Math.min(100, Math.round(effectiveScore(a) * 0.88)))}/100 — ${a.jdVerdict || "Role competency match"}  `,
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
