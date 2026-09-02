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

  const M = 36;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const BODY = W - M * 2;
  let y = M;

  const score = effectiveScore(a);
  const tone: [number, number, number] =
    score >= 80 ? [16, 149, 103] : score >= 65 ? [217, 119, 6] : [220, 38, 38];
  const [tr, tg, tb] = tone;

  // Sanitize any non-ASCII characters that corrupt in standard jsPDF Helvetica
  const clean = (s: string): string => {
    if (!s) return "";
    return s
      .replace(/[–—]/g, "-")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/→/g, "->")
      .replace(/•/g, "-")
      .replace(/…/g, "...")
      .replace(/[^\x20-\x7E\n\r]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const drawPageHeader = (pageNum: number) => {
    if (pageNum > 1) {
      doc.setFillColor(248, 250, 252).rect(0, 0, W, 36, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.8).line(0, 36, W, 36);
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(71, 85, 105);
      doc.text(`${clean(a.candidateName) || "Candidate"} - Placement Audit Report`, M, 22);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(148, 163, 184);
      doc.text(`Score: ${score}/100`, W - M, 22, { align: "right" });
    }
  };

  // Safe pagination: ensures at least 'needed' vertical pt is available on current page
  const ensure = (needed = 24) => {
    if (y + needed > H - M - 24) {
      doc.addPage();
      drawPageHeader(doc.getNumberOfPages());
      y = 52;
    }
  };

  // Section heading with high needed margin (65pt) to avoid orphaned headings at bottom of page
  const heading = (title: string, needed = 65) => {
    ensure(needed);
    doc.setFillColor(241, 245, 249).roundedRect(M, y, BODY, 19, 3, 3, "F");
    doc.setDrawColor(203, 213, 225).setLineWidth(0.6).roundedRect(M, y, BODY, 19, 3, 3, "S");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(15, 23, 42);
    doc.text(clean(title).toUpperCase(), M + 8, y + 13);
    y += 26;
  };

  const textBlock = (
    s: string,
    size = 8.5,
    style: "normal" | "bold" | "italic" = "normal",
    color: [number, number, number] = [51, 65, 85],
    indent = 0,
  ) => {
    if (!s) return;
    const sanitized = clean(s);
    doc.setFont("helvetica", style).setFontSize(size).setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(sanitized, BODY - indent) as string[];
    for (const line of lines) {
      ensure(size + 5);
      doc.text(line, M + indent, y);
      y += size + 4;
    }
  };

  const bulletList = (items: string[], indent = 12) => {
    if (!items.length) {
      textBlock("None reported.", 8.5, "italic", [148, 163, 184], indent);
      return;
    }
    for (const item of items) {
      if (!item) continue;
      const sanitized = clean(item);
      ensure(16);
      doc.setFillColor(tr, tg, tb).circle(M + indent + 2, y - 3, 1.8, "F");
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(sanitized, BODY - indent - 14) as string[];
      lines.forEach((line, i) => {
        if (i > 0) ensure(13);
        doc.text(line, M + indent + 10, y);
        y += 12;
      });
      y += 2;
    }
  };

  // ================= 1. EXECUTIVE HEADER BANNER =================
  doc.setFillColor(15, 23, 42).rect(0, 0, W, 105, "F");

  // Candidate Name & Role
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(255, 255, 255);
  doc.text(clean(a.candidateName) || "Unnamed Candidate", M, 36);

  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(203, 213, 225);
  doc.text(`${clean(a.role) || "Software Engineering"} - ${clean(fileName)}`, M, 54);

  doc.setFontSize(8).setTextColor(148, 163, 184);
  const evalDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  doc.text(`Placement Evaluation - Generated ${evalDate}`, M, 70);

  // Evaluation basis pill in header
  if (a.evaluationBasis) {
    const basisText =
      a.evaluationBasis === "jd-fit"
        ? `JD-Aligned Assessment`
        : `Global SDE Standard Benchmark`;
    doc.setFillColor(30, 41, 59).roundedRect(M, 79, 190, 15, 3, 3, "F");
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(148, 163, 184);
    doc.text(basisText, M + 8, 90);
  }

  // Right Score Card in Header
  const scoreBoxW = 104;
  const scoreBoxX = W - M - scoreBoxW;
  doc.setFillColor(30, 41, 59).roundedRect(scoreBoxX, 18, scoreBoxW, 72, 6, 6, "F");
  doc.setDrawColor(51, 65, 85).setLineWidth(0.6).roundedRect(scoreBoxX, 18, scoreBoxW, 72, 6, 6, "S");

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

  y = 118;

  // Tier Badge Bar
  doc.setFillColor(score >= 80 ? 240 : score >= 65 ? 254 : 254, score >= 80 ? 253 : score >= 65 ? 243 : 242, score >= 80 ? 244 : score >= 65 ? 199 : 242).roundedRect(M, y, BODY, 24, 4, 4, "F");
  doc.setDrawColor(tr, tg, tb).setLineWidth(0.8).roundedRect(M, y, BODY, 24, 4, 4, "S");
  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(tr, tg, tb);
  doc.text(clean(a.readinessTier), M + 12, y + 16);
  if (a.manualScore !== null) {
    doc.setFont("helvetica", "italic").setFontSize(7.5).setTextColor(100, 116, 139);
    doc.text(`(Manual Override Applied: AI Score ${a.overallScore})`, W - M - 12, y + 16, { align: "right" });
  }
  y += 32;

  // ================= 1B. CRITICAL ATS & AI PARSING ADVISORY =================
  ensure(60);
  const advBg: [number, number, number] = [255, 251, 235]; // Warm gold tint
  const advBorder: [number, number, number] = [245, 158, 11];
  const advText: [number, number, number] = [120, 53, 15];

  const advP1 = "NOTICE: If this report marks sections or skills as missing that actually exist in your resume, your document's text layer is unreadable by automated AI & ATS parsers.";
  const advP2 = "Resumes built with graphic tools (Canva, Figma, Photoshop, multi-column tables) frequently fail automated text extraction. To ensure 100% parsing accuracy, export your resume using clean code-to-PDF or a standard LaTeX template (e.g. Overleaf / Jake's Resume) rather than graphical canvas templates.";
  
  const advP1Lines = doc.splitTextToSize(advP1, BODY - 26) as string[];
  const advP2Lines = doc.splitTextToSize(advP2, BODY - 26) as string[];
  const advH = 20 + advP1Lines.length * 9.5 + advP2Lines.length * 9.5 + 8;

  doc.setFillColor(advBg[0], advBg[1], advBg[2]).roundedRect(M, y, BODY, advH, 4, 4, "F");
  doc.setDrawColor(advBorder[0], advBorder[1], advBorder[2]).setLineWidth(0.6).roundedRect(M, y, BODY, advH, 4, 4, "S");
  // Left accent bar
  doc.setFillColor(advBorder[0], advBorder[1], advBorder[2]).roundedRect(M, y, 4, advH, 2, 2, "F");

  // Warning Header
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(advText[0], advText[1], advText[2]);
  doc.text("[!] CRITICAL ATS & AI MACHINE-READABILITY ADVISORY", M + 12, y + 12);

  let advY = y + 23;
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(146, 64, 14);
  advP1Lines.forEach((l) => {
    doc.text(l, M + 12, advY);
    advY += 9.5;
  });
  advY += 2;
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(120, 53, 15);
  advP2Lines.forEach((l) => {
    doc.text(l, M + 12, advY);
    advY += 9.5;
  });

  y += advH + 10;

  // ================= 2. RECRUITER & HR VERDICTS =================
  if (a.recruiterFirstImpression || a.hrVerdict) {
    heading("Recruiter & Placement Committee Verdict", 65);
    if (a.recruiterFirstImpression) {
      const impClean = clean(a.recruiterFirstImpression);
      const impLines = doc.splitTextToSize(impClean, BODY - 20) as string[];
      const impH = Math.max(30, impLines.length * 11 + 18);
      ensure(impH + 4);
      doc.setFillColor(248, 250, 252).roundedRect(M, y, BODY, impH, 4, 4, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(M, y, BODY, impH, 4, 4, "S");
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(71, 85, 105);
      doc.text("6-SECOND RECRUITER SCAN:", M + 10, y + 12);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(30, 41, 59);
      impLines.forEach((line, idx) => {
        doc.text(line, M + 10, y + 23 + idx * 11);
      });
      y += impH + 6;
    }
    if (a.hrVerdict) {
      const vClean = clean(a.hrVerdict);
      const vLines = doc.splitTextToSize(vClean, BODY - 20) as string[];
      const vH = Math.max(30, vLines.length * 11 + 18);
      ensure(vH + 4);
      doc.setFillColor(248, 250, 252).roundedRect(M, y, BODY, vH, 4, 4, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(M, y, BODY, vH, 4, 4, "S");
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(71, 85, 105);
      doc.text("PLACEMENT VERDICT & HIRING RECOMMENDATION:", M + 10, y + 12);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(30, 41, 59);
      vLines.forEach((line, idx) => {
        doc.text(line, M + 10, y + 23 + idx * 11);
      });
      y += vH + 8;
    }
  }

  // ================= 3. DETERMINISTIC ATS METRICS GRID =================
  if (a.ats) {
    heading("ATS Engine Audit & Technical Metrics", 75);
    const m = a.ats.metrics;

    // 4 metric cards
    ensure(44);
    const cardW = (BODY - 24) / 4;
    const cards = [
      { label: "Word Count", val: `${m.words} words`, sub: `approx. ${m.estimatedPages} page(s)` },
      { label: "Bullet Points", val: `${m.bullets}`, sub: `avg ${m.readabilityWordsPerBullet} w/bullet` },
      { label: "Quantified Impact", val: `${m.quantifiedBullets}/${m.bullets || 1}`, sub: `${m.bullets ? Math.round((m.quantifiedBullets / m.bullets) * 100) : 0}% measurable` },
      { label: "Action Verbs", val: `${m.actionVerbBullets}/${m.bullets || 1}`, sub: `${m.bullets ? Math.round((m.actionVerbBullets / m.bullets) * 100) : 0}% strong starts` },
    ];

    cards.forEach((c, idx) => {
      const cx = M + idx * (cardW + 8);
      doc.setFillColor(248, 250, 252).roundedRect(cx, y, cardW, 36, 4, 4, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(cx, y, cardW, 36, 4, 4, "S");
      doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(100, 116, 139);
      doc.text(c.label.toUpperCase(), cx + 8, y + 11);
      doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(15, 23, 42);
      doc.text(c.val, cx + 8, y + 23);
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(148, 163, 184);
      doc.text(c.sub, cx + 8, y + 32);
    });
    y += 44;

    // ATS Category Progress Bars
    for (const cat of a.ats.categories) {
      ensure(22);
      const catPct = cat.max > 0 ? Math.max(0, Math.min(1, cat.score / cat.max)) : 0;
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(51, 65, 85);
      doc.text(clean(cat.label), M, y);
      doc.text(`${cat.score}/${cat.max} pts`, M + BODY, y, { align: "right" });
      y += 5;

      doc.setFillColor(226, 232, 240).roundedRect(M, y, BODY, 4, 2, 2, "F");
      const cTone: [number, number, number] =
        catPct >= 0.75 ? [16, 149, 103] : catPct >= 0.5 ? [217, 119, 6] : [220, 38, 38];
      doc.setFillColor(cTone[0], cTone[1], cTone[2]).roundedRect(M, y, Math.max(2, BODY * catPct), 4, 2, 2, "F");
      y += 12;
    }
    y += 4;
  }

  // ================= 4. CRITICAL ISSUES & BLOCKERS =================
  if (a.criticalIssues.length || (a.ats?.blockers && a.ats.blockers.length > 0)) {
    heading("Identified Resume Mistakes & Critical Blockers", 80);

    if (a.ats?.blockers && a.ats.blockers.length > 0) {
      for (const b of a.ats.blockers) {
        const bClean = clean(b);
        const bLines = doc.splitTextToSize(bClean, BODY - 130) as string[];
        const blockH = Math.max(22, bLines.length * 11 + 10);
        ensure(blockH + 4);
        doc.setFillColor(254, 242, 242).roundedRect(M, y, BODY, blockH, 3, 3, "F");
        doc.setDrawColor(254, 202, 202).setLineWidth(0.5).roundedRect(M, y, BODY, blockH, 3, 3, "S");
        doc.setFillColor(220, 38, 38).roundedRect(M, y, 3.5, blockH, 2, 2, "F");
        doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(220, 38, 38);
        doc.text("[!] ATS HARD BLOCKER:", M + 8, y + 13);
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(127, 29, 29);
        bLines.forEach((line, idx) => {
          doc.text(line, M + 120, y + 13 + idx * 11);
        });
        y += blockH + 6;
      }
    }

    for (const issue of a.criticalIssues) {
      const isCrit = issue.severity === "critical";
      const isMaj = issue.severity === "major";
      const badgeBg: [number, number, number] = isCrit ? [254, 242, 242] : isMaj ? [254, 243, 199] : [241, 245, 249];
      const badgeText: [number, number, number] = isCrit ? [220, 38, 38] : isMaj ? [180, 83, 9] : [71, 85, 105];

      const pLines = doc.splitTextToSize(clean(issue.problem), BODY - 24) as string[];
      const evLines = issue.evidence ? (doc.splitTextToSize(`Evidence: "${clean(issue.evidence)}"`, BODY - 24) as string[]) : [];
      const fixLines = issue.fix ? (doc.splitTextToSize(`Actionable Fix: ${clean(issue.fix)}`, BODY - 24) as string[]) : [];

      const cardH = 20 + pLines.length * 11 + (evLines.length ? evLines.length * 10 + 3 : 0) + (fixLines.length ? fixLines.length * 11 + 3 : 0) + 6;
      ensure(cardH + 4);

      doc.setFillColor(badgeBg[0], badgeBg[1], badgeBg[2]).roundedRect(M, y, BODY, cardH, 4, 4, "F");
      doc.setDrawColor(badgeText[0], badgeText[1], badgeText[2]).setLineWidth(0.5).roundedRect(M, y, BODY, cardH, 4, 4, "S");
      // Left accent line
      doc.setFillColor(badgeText[0], badgeText[1], badgeText[2]).roundedRect(M, y, 3.5, cardH, 2, 2, "F");

      // Severity & Area Header
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(badgeText[0], badgeText[1], badgeText[2]);
      doc.text(`[${issue.severity.toUpperCase()}] ${clean(issue.area)}`, M + 10, y + 13);

      let textY = y + 25;

      // Problem description
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(30, 41, 59);
      pLines.forEach((line) => {
        doc.text(line, M + 10, textY);
        textY += 11;
      });

      // Evidence quote
      if (evLines.length) {
        textY += 2;
        doc.setFont("helvetica", "italic").setFontSize(7.5).setTextColor(100, 116, 139);
        evLines.forEach((line) => {
          doc.text(line, M + 10, textY);
          textY += 10;
        });
      }

      // Actionable Fix
      if (fixLines.length) {
        textY += 2;
        doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(16, 149, 103);
        fixLines.forEach((line) => {
          doc.text(line, M + 10, textY);
          textY += 11;
        });
      }

      y += cardH + 6;
    }
  }

  // ================= 5. GRAMMAR, TYPO & PHRASING AUDIT =================
  if (a.grammarAndOcrErrors.length) {
    heading("Grammar, Spelling & Phrasing Mistakes", 70);
    for (const g of a.grammarAndOcrErrors) {
      const gClean = clean(g);
      const gLines = doc.splitTextToSize(gClean, BODY - 28) as string[];
      const gH = Math.max(22, gLines.length * 11 + 12);
      ensure(gH + 4);

      doc.setFillColor(248, 250, 252).roundedRect(M, y, BODY, gH, 3, 3, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(M, y, BODY, gH, 3, 3, "S");

      // Draw vector dot indicator
      doc.setFillColor(217, 119, 6).circle(M + 10, y + 10, 2.5, "F");

      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(30, 41, 59);
      gLines.forEach((line, idx) => {
        doc.text(line, M + 18, y + 13 + idx * 11);
      });

      y += gH + 4;
    }
  }

  // ================= 6. ATS FORMATTING & PARSING GLITCHES =================
  if (a.formattingProblems.length) {
    heading("ATS Layout & Formatting Anomalies", 70);
    for (const f of a.formattingProblems) {
      const fClean = clean(f);
      const fLines = doc.splitTextToSize(fClean, BODY - 28) as string[];
      const fH = Math.max(20, fLines.length * 11 + 10);
      ensure(fH + 4);

      doc.setFillColor(254, 242, 242).roundedRect(M, y, BODY, fH, 3, 3, "F");
      doc.setDrawColor(254, 202, 202).setLineWidth(0.5).roundedRect(M, y, BODY, fH, 3, 3, "S");
      doc.setFillColor(220, 38, 38).roundedRect(M, y, 3, fH, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(220, 38, 38);
      doc.text("[!]", M + 7, y + 13);

      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(127, 29, 29);
      fLines.forEach((line, idx) => {
        doc.text(line, M + 22, y + 13 + idx * 11);
      });

      y += fH + 4;
    }
  }

  // ================= 7. SKILL MATRIX & TECH STACK =================
  heading("Technical Skills & Placement Gap Analysis", 70);

  if (a.skillMatrix.matched.length) {
    ensure(24);
    doc.setFillColor(16, 149, 103).circle(M + 4, y - 3, 2.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(16, 149, 103);
    doc.text("[+] Verified Technical Skills Found in Resume:", M + 10, y);
    y += 12;
    textBlock(clean(a.skillMatrix.matched.join(" - ")), 8.5, "normal", [51, 65, 85], 10);
    y += 4;
  }

  if (a.skillMatrix.missing.length) {
    ensure(24);
    doc.setFillColor(220, 38, 38).circle(M + 4, y - 3, 2.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(220, 38, 38);
    doc.text("[-] Missing Target Role / JD Keywords:", M + 10, y);
    y += 12;
    textBlock(clean(a.skillMatrix.missing.join(" - ")), 8.5, "normal", [127, 29, 29], 10);
    y += 4;
  }

  if (a.skillMatrix.recommended.length) {
    ensure(24);
    doc.setFillColor(217, 119, 6).circle(M + 4, y - 3, 2.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(217, 119, 6);
    doc.text("[>] Highest Placement Impact Skills to Acquire Next:", M + 10, y);
    y += 12;
    textBlock(clean(a.skillMatrix.recommended.join(" - ")), 8.5, "normal", [120, 53, 15], 10);
    y += 6;
  }

  // ================= 8. BULLET REWRITES =================
  if (a.bulletRewrites.length) {
    heading("Actionable Bullet Point Transformations", 80);
    for (const r of a.bulletRewrites) {
      const bLines = doc.splitTextToSize(clean(r.original), BODY - 110) as string[];
      const aLines = doc.splitTextToSize(clean(r.rewritten), BODY - 110) as string[];
      const rLines = r.reason ? (doc.splitTextToSize(`Why: ${clean(r.reason)}`, BODY - 20) as string[]) : [];

      const rwH = 26 + bLines.length * 11 + aLines.length * 12 + (rLines.length ? rLines.length * 10 + 4 : 0);
      ensure(rwH + 4);

      doc.setFillColor(248, 250, 252).roundedRect(M, y, BODY, rwH, 4, 4, "F");
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).roundedRect(M, y, BODY, rwH, 4, 4, "S");

      let curY = y + 13;

      // Before
      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(220, 38, 38);
      doc.text("[-] BEFORE (WEAK):", M + 10, curY);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
      bLines.forEach((line, idx) => {
        doc.text(line, M + 110, curY + idx * 11);
      });
      curY += Math.max(16, bLines.length * 11 + 4);

      // After
      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(16, 149, 103);
      doc.text("[+] AFTER (IMPACT):", M + 10, curY);
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(15, 23, 42);
      aLines.forEach((line, idx) => {
        doc.text(line, M + 110, curY + idx * 11);
      });
      curY += Math.max(16, aLines.length * 11 + 4);

      // Rationale
      if (rLines.length) {
        doc.setFont("helvetica", "italic").setFontSize(7.5).setTextColor(71, 85, 105);
        rLines.forEach((line, idx) => {
          doc.text(line, M + 10, curY + idx * 10);
        });
      }

      y += rwH + 6;
    }
  }

  // ================= 9. IMPROVEMENT PLAN & SUGGESTIONS =================
  if (a.techImprovementIdeas.length || a.projectSuggestions.length) {
    heading("Placement Enhancement Roadmap", 70);
    if (a.techImprovementIdeas.length) {
      ensure(18);
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(30, 41, 59);
      doc.text("Key Technical Upgrades:", M, y);
      y += 12;
      bulletList(a.techImprovementIdeas, 8);
    }
    if (a.projectSuggestions.length) {
      ensure(18);
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
    doc.text("Placement Screening Cell - AI & Deterministic Resume Audit", M, H - 16);
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
