import React, { useState, useEffect } from "react";
import { effectiveScore, type Analysis } from "@/lib/analysis-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Copy, Check, Send, FileText, Sparkles, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface EmailDraftModalProps {
  analysis: Analysis | null;
  roleTitle?: string;
  companyName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailDraftModal({
  analysis,
  roleTitle = "Software Engineer",
  companyName = "VSB Placement Cell",
  open,
  onOpenChange,
}: EmailDraftModalProps) {
  const [reportType, setReportType] = useState<"detailed" | "summary">("detailed");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setCopied(false);
    }
  }, [open]);

  if (!analysis) return null;

  const candidateName = analysis.candidateName || "Candidate";
  const score = effectiveScore(analysis);
  const matchedSkills = (analysis.skillMatrix?.matched || []).join(", ");
  const missingSkills = (analysis.skillMatrix?.missing || []).join(", ");
  const recommended = (analysis.skillMatrix?.recommended || []).slice(0, 4).join(", ");
  const strengths = (analysis.strengths || []).slice(0, 3);
  const projectSuggestions = (analysis.projectSuggestions || []).slice(0, 2);

  const detailedSubject = `Resume Analysis & ATS Assessment Report — ${candidateName} (${roleTitle})`;
  const detailedBody = `Dear ${candidateName},

Here is your detailed resume analysis and ATS screening report for the "${roleTitle}" benchmark at ${companyName}.

==================================================
📊 ASSESSMENT SUMMARY
==================================================
• Candidate: ${candidateName}
• Target Role: ${roleTitle}
• Overall ATS Score: ${score}/100
• Readiness Tier: ${analysis.readinessTier}
${analysis.jdScore !== null ? `• Job Description Fit: ${analysis.jdScore}%\n` : ""}${analysis.hrVerdict ? `\nHR Assessment:\n${analysis.hrVerdict}\n` : ""}
==================================================
📈 SCORE BREAKDOWN
==================================================
${(analysis.scoreBreakdown || [])
  .map((b) => `• ${b.category}: ${b.score}/${b.max} (${b.note || "Evaluated"})`)
  .join("\n")}

==================================================
🛠 SKILLS & COMPETENCY MATRIX
==================================================
✅ Matched Skills:
${matchedSkills || "Fundamental engineering competencies verified"}

${
  missingSkills
    ? `⚠️ Missing Target Role Gaps:\n${missingSkills}\n`
    : ""
}${
  recommended
    ? `🚀 High-Impact Recommended Tech to Learn:\n${recommended}\n`
    : ""
}
${
  strengths.length > 0
    ? `==================================================\n🌟 KEY STRENGTHS\n==================================================\n${strengths
        .map((s) => `• ${s}`)
        .join("\n")}\n`
    : ""
}${
  projectSuggestions.length > 0
    ? `==================================================\n💡 PROJECT & RESUME ENHANCEMENTS\n==================================================\n${projectSuggestions
        .map((p) => `• ${p}`)
        .join("\n")}\n`
    : ""
}==================================================
Generated automatically by ${companyName} AI Screening Engine.`;

  const summarySubject = `Resume Screening Result: ${candidateName} — ${score}/100 (${analysis.readinessTier.split(":")[0]})`;
  const summaryBody = `Hi ${candidateName},

Your resume evaluation for ${roleTitle} is complete.

• Overall Score: ${score}/100
• Readiness Status: ${analysis.readinessTier}
• Key Matched Skills: ${matchedSkills || "Core Technical Background"}
${missingSkills ? `• Missing Target Skills: ${missingSkills}\n` : ""}
Feedback Summary:
${analysis.hrVerdict || analysis.recruiterFirstImpression || "Good baseline technical profile with actionable opportunities for alignment."}

Best regards,
Placement & Screening Team
${companyName}`;

  const activeSubject = reportType === "detailed" ? detailedSubject : summarySubject;
  const activeBody = reportType === "detailed" ? detailedBody : summaryBody;

  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${activeSubject}\n\n${activeBody}`);
    setCopied(true);
    toast.success("Analysis report copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = () => {
    const to = recipientEmail.trim();
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(activeSubject)}&body=${encodeURIComponent(activeBody)}`;
    window.open(mailtoUrl, "_blank");
    toast.success(to ? `Opening mail client to send report to ${to}...` : "Opening mail client with analysis report...");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Share Analysis Result Report</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Email candidate resume scorecard and audit feedback for <span className="font-semibold text-foreground">{candidateName}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Report Format Selector */}
        <div className="flex gap-2 my-2 p-1 rounded-xl bg-muted/60 border border-border">
          <button
            onClick={() => setReportType("detailed")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              reportType === "detailed"
                ? "bg-background text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Full Analysis &amp; Improvement Report
          </button>
          <button
            onClick={() => setReportType("summary")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              reportType === "summary"
                ? "bg-background text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
            Candidate Quick Summary
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Candidate Email (Optional)
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="candidate@example.com (leave blank to choose in mail app)"
              className="w-full text-xs px-3 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Subject</label>
            <input
              type="text"
              readOnly
              value={activeSubject}
              className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Report Content Preview</label>
            <textarea
              rows={8}
              readOnly
              value={activeBody}
              className="w-full text-xs font-mono px-3 py-2.5 rounded-lg bg-card border border-border text-foreground leading-relaxed focus:outline-none resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between mt-4">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="text-[10px]">
              Score: {score}/100
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {analysis.readinessTier.split(":")[1]?.trim() || analysis.readinessTier}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy Report"}
            </Button>
            <Button size="sm" onClick={handleSendEmail} className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
              <Send className="w-3.5 h-3.5" />
              Send Report
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
