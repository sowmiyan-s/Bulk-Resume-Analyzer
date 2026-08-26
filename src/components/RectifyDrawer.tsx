import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  FileDown,
  FileText,
  GraduationCap,
  Layers,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { effectiveScore, tierTone, type Analysis, type Issue } from "@/lib/analysis-types";
import type { TextFix } from "@/lib/sanitize";
import { ScoreRing } from "./ScoreRing";

export type RectifyTarget = {
  id: string;
  fileName: string;
  analysis: Analysis;
  rawText: string;
  cleanText: string;
  fixes: TextFix[];
  warnings: string[];
};

type Props = {
  target: RectifyTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (
    id: string,
    payload: { cleanText: string; manualScore: number | null; officerNotes: string },
  ) => void;
  onReanalyze: (id: string) => void;
  onExportPdf: (id: string) => void;
  onDelete?: (id: string) => void;
  hasActiveJd?: boolean;
  onReanalyzeWithJd?: (id: string) => void;
};



function sevTone(s: Issue["severity"]) {
  if (s === "critical") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (s === "major") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border bg-secondary text-muted-foreground";
}

export function RectifyDrawer({
  target,
  open,
  onOpenChange,
  onApply,
  onReanalyze,
  onExportPdf,
  onDelete,
  hasActiveJd,
  onReanalyzeWithJd,
}: Props) {
  const [notes, setNotes] = useState("");
  const [manual, setManual] = useState<string>("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (target?.analysis) {
      setNotes(target.analysis.officerNotes ?? "");
      setManual(
        target.analysis.manualScore !== null && target.analysis.manualScore !== undefined
          ? String(target.analysis.manualScore)
          : "",
      );
    }
  }, [target]);

  if (!target) return null;
  const a = target.analysis;

  const handleSave = () => {
    const parsed = manual.trim() === "" ? null : Number(manual);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)) {
      toast.error("Score override must be a number between 0 and 100.");
      return;
    }
    startTransition(() => {
      onApply(target.id, {
        cleanText: target.cleanText,
        manualScore: parsed,
        officerNotes: notes,
      });
    });
  };

  const handleDeleteCandidate = () => {
    if (confirm(`Are you sure you want to delete candidate "${a.candidateName}"?`)) {
      onOpenChange(false);
      onDelete?.(target.id);
    }
  };

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const sec = a.sectionAudits;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 sm:max-w-[min(96vw,1020px)] shadow-2xl"
      >
        {/* Fixed Header */}
        <SheetHeader className="border-b border-border bg-secondary/30 px-6 py-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ScoreRing
                value={effectiveScore(a)}
                label={a.manualScore !== null ? "OVERRIDE" : "SCORE"}
                size={64}
              />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-lg font-bold text-foreground">
                    {a.candidateName}
                  </SheetTitle>
                  <Badge
                    variant="outline"
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${tierTone(
                      a.readinessTier,
                    )}`}
                  >
                    {a.readinessTier}
                  </Badge>
                  {a.jdScore !== null && (
                    <Badge
                      variant="outline"
                      className="border-primary/40 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    >
                      🎯 {a.jdScore}% JD Match
                    </Badge>
                  )}
                </div>
                <SheetDescription className="text-xs text-muted-foreground">
                  Target: <span className="font-semibold text-foreground">{a.role}</span> · File:{" "}
                  <span className="font-mono text-muted-foreground">{target.fileName}</span>
                </SheetDescription>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {hasActiveJd && onReanalyzeWithJd ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-medium rounded-lg border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => onReanalyzeWithJd(target.id)}
                  title="Re-evaluate candidate against currently entered Job Description"
                >
                  <RefreshCw className="size-3.5 mr-1.5" /> Re-evaluate (Current JD)
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-medium rounded-lg"
                  onClick={() => onReanalyze(target.id)}
                >
                  <RefreshCw className="size-3.5 mr-1.5" /> Re-evaluate
                </Button>
              )}
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs font-semibold rounded-lg shadow-sm"
                onClick={() => onExportPdf(target.id)}
              >
                <FileDown className="size-3.5 mr-1.5" /> Export PDF
              </Button>
              {onDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDeleteCandidate}
                  title="Delete Candidate Record"
                  aria-label="Delete Candidate Record"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Unified Smooth Scroll Container with Sticky Tabs */}
        <Tabs defaultValue="sections" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {/* Top Executive Summary */}
            <div className="border-b border-border bg-background p-6 space-y-4">
              <div className="grid gap-4 lg:grid-cols-12">
                {/* Left Column: First Impression & HR Verdict */}
                <div className="space-y-3 lg:col-span-7">
                  {a.recruiterFirstImpression && (
                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1 flex items-center gap-1.5">
                        <Target className="size-3.5" /> 6-Second Recruiter First Impression
                      </p>
                      <p className="text-xs italic text-foreground leading-relaxed">
                        "{a.recruiterFirstImpression}"
                      </p>
                    </div>
                  )}

                  {a.hrVerdict && (
                    <div className="rounded-xl border border-border bg-secondary/20 p-3.5 space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Hiring Verdict &amp; Placement Readiness
                      </p>
                      <p className="text-xs text-foreground leading-relaxed">{a.hrVerdict}</p>
                    </div>
                  )}

                  {a.jdVerdict && (
                    <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs leading-relaxed">
                      <span className="font-semibold text-accent">JD Alignment: </span>
                      <span className="text-foreground/90">{a.jdVerdict}</span>
                    </div>
                  )}
                </div>

                {/* Right Column: Score Breakdown */}
                <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3 lg:col-span-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Section Competency Breakdown
                  </p>
                  <div className="space-y-3">
                    {a.scoreBreakdown.map((row, i) => {
                      const pct = row.max ? Math.round((row.score / row.max) * 100) : 0;
                      const toneColor =
                        pct >= 75
                          ? "text-success"
                          : pct >= 55
                            ? "text-warning"
                            : "text-destructive";
                      const barBg =
                        pct >= 75 ? "bg-success" : pct >= 55 ? "bg-warning" : "bg-destructive";
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">{row.category}</span>
                            <span className={`font-mono text-xs font-bold ${toneColor}`}>
                              {row.score}
                              <span className="text-muted-foreground font-normal">/{row.max}</span>
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                            <div
                              className={`h-full rounded-full ${barBg} transition-all duration-500`}
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Tab Navigation Bar */}
            <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur px-6 py-2">
              <TabsList className="h-9 gap-1 bg-secondary/40 p-1 rounded-xl flex-wrap">
                <TabsTrigger
                  value="sections"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs rounded-lg px-3 py-1.5 font-semibold"
                >
                  <FileText className="size-3.5 mr-1.5 text-primary" />
                  Section-by-Section Audit
                </TabsTrigger>
                <TabsTrigger
                  value="roadmap"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs rounded-lg px-3 py-1.5 font-semibold"
                >
                  <Lightbulb className="size-3.5 mr-1.5 text-accent" />
                  Actionable Roadmap &amp; Tips
                </TabsTrigger>
                <TabsTrigger
                  value="rewrites"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs rounded-lg px-3 py-1.5 font-semibold"
                >
                  <Sparkles className="size-3.5 mr-1.5 text-success" />
                  Bullet Rewrites ({a.bulletRewrites.length})
                </TabsTrigger>
                <TabsTrigger
                  value="issues"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs rounded-lg px-3 py-1.5 font-semibold"
                >
                  <AlertTriangle className="size-3.5 mr-1.5 text-warning" />
                  Issues &amp; Red Flags ({a.criticalIssues.length})
                </TabsTrigger>
                <TabsTrigger
                  value="skills"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs rounded-lg px-3 py-1.5 font-semibold"
                >
                  <Layers className="size-3.5 mr-1.5 text-primary" />
                  Skills Matrix
                </TabsTrigger>
                <TabsTrigger
                  value="strengths"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs rounded-lg px-3 py-1.5 font-semibold"
                >
                  <CheckCircle2 className="size-3.5 mr-1.5 text-success" />
                  Strengths ({a.strengths.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab Contents Area */}
            <div className="p-6">
              {/* Tab: Section-by-Section Real Audit */}
              <TabsContent value="sections" className="mt-0 space-y-4">
                <div className="space-y-4">
                  {/* 1. Professional Summary */}
                  {sec?.summary && (
                    <div className="rounded-xl border border-border bg-secondary/15 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BookOpen className="size-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            1. Professional Summary &amp; Career Positioning
                          </h4>
                        </div>
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {sec.summary.score} / {sec.summary.max} pts
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/30 p-3 rounded-lg border border-border/60">
                        {sec.summary.audit}
                      </p>
                      {sec.summary.fixTip && (
                        <div className="text-xs text-success bg-success/10 border border-success/30 p-2.5 rounded-lg flex items-start gap-1.5">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-foreground">Improvement Tip:</strong>{" "}
                            {sec.summary.fixTip}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. Technical Skills */}
                  {sec?.skills && (
                    <div className="rounded-xl border border-border bg-secondary/15 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Code2 className="size-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            2. Technical Skills &amp; Stack Depth
                          </h4>
                        </div>
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {sec.skills.score} / {sec.skills.max} pts
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/30 p-3 rounded-lg border border-border/60">
                        {sec.skills.audit}
                      </p>
                      {sec.skills.matchedKeywords && sec.skills.matchedKeywords.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                            Verified Skills:
                          </span>
                          {sec.skills.matchedKeywords.map((k, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="text-[11px] bg-success/10 text-success border-success/30 px-2 py-0.2"
                            >
                              {k}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {sec.skills.missingCriticalSkills && sec.skills.missingCriticalSkills.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-destructive mr-1">
                            Missing Requirements:
                          </span>
                          {sec.skills.missingCriticalSkills.map((k, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="text-[11px] bg-destructive/10 text-destructive border-destructive/30 px-2 py-0.2"
                            >
                              {k}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {sec.skills.fixTip && (
                        <div className="text-xs text-success bg-success/10 border border-success/30 p-2.5 rounded-lg flex items-start gap-1.5">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-foreground">Skills Action:</strong>{" "}
                            {sec.skills.fixTip}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. Project Work */}
                  {sec?.projects && (
                    <div className="rounded-xl border border-border bg-secondary/15 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wrench className="size-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            3. Project Complexity &amp; Architecture
                          </h4>
                          {sec.projects.architectureRating && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-primary/10 text-primary border-primary/30"
                            >
                              {sec.projects.architectureRating}
                            </Badge>
                          )}
                        </div>
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {sec.projects.score} / {sec.projects.max} pts
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/30 p-3 rounded-lg border border-border/60">
                        {sec.projects.audit}
                      </p>
                      {sec.projects.fixTip && (
                        <div className="text-xs text-success bg-success/10 border border-success/30 p-2.5 rounded-lg flex items-start gap-1.5">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-foreground">Project Enhancement:</strong>{" "}
                            {sec.projects.fixTip}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Internships & Practical Experience (JD Relevance) */}
                  {sec?.internships && (
                    <div className="rounded-xl border border-border bg-secondary/15 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Briefcase className="size-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            4. Internships &amp; Practical Experience (JD Relevance)
                          </h4>
                          <span
                            className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                              sec.internships.jdRelevancePct >= 75
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : sec.internships.jdRelevancePct >= 50
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                  : "bg-red-500/15 text-red-500 border-red-500/30"
                            }`}
                          >
                            🎯 {sec.internships.jdRelevancePct}% JD Relevance
                          </span>
                        </div>
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {sec.internships.score} / {sec.internships.max} pts
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/30 p-3 rounded-lg border border-border/60">
                        {sec.internships.audit}
                      </p>
                      {sec.internships.jdRelevanceExplanation && (
                        <div className="text-xs bg-accent/10 border border-accent/30 p-2.5 rounded-lg text-foreground">
                          <strong className="text-accent">Job Description Mapping: </strong>
                          {sec.internships.jdRelevanceExplanation}
                        </div>
                      )}
                      {sec.internships.fixTip && (
                        <div className="text-xs text-success bg-success/10 border border-success/30 p-2.5 rounded-lg flex items-start gap-1.5">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-foreground">Internship Bullet Strategy:</strong>{" "}
                            {sec.internships.fixTip}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 5. Verified Certifications */}
                  {sec?.certifications && (
                    <div className="rounded-xl border border-border bg-secondary/15 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="size-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            5. Verified Certifications &amp; Accreditations
                          </h4>
                          {sec.certifications.verifiedCount > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-success/10 text-success border-success/30"
                            >
                              {sec.certifications.verifiedCount} Verified
                            </Badge>
                          )}
                        </div>
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {sec.certifications.score} / {sec.certifications.max} pts
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/30 p-3 rounded-lg border border-border/60">
                        {sec.certifications.audit}
                      </p>
                      {sec.certifications.fixTip && (
                        <div className="text-xs text-success bg-success/10 border border-success/30 p-2.5 rounded-lg flex items-start gap-1.5">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-foreground">Certification Strategy:</strong>{" "}
                            {sec.certifications.fixTip}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 6. Achievements & Verifiable Proof */}
                  {sec?.achievements && (
                    <div className="rounded-xl border border-border bg-secondary/15 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Award className="size-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            6. Achievements, Hackathons &amp; Verifiable Proof
                          </h4>
                        </div>
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {sec.achievements.score} / {sec.achievements.max} pts
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/30 p-3 rounded-lg border border-border/60">
                        {sec.achievements.audit}
                      </p>
                      {sec.achievements.fixTip && (
                        <div className="text-xs text-success bg-success/10 border border-success/30 p-2.5 rounded-lg flex items-start gap-1.5">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-foreground">Achievement Impact:</strong>{" "}
                            {sec.achievements.fixTip}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tab: Actionable Improvement Roadmap */}
              <TabsContent value="roadmap" className="mt-0 space-y-5">
                {/* Section-by-Section Step-by-Step Fixes */}
                {a.sectionImprovements && a.sectionImprovements.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <TrendingUp className="size-4 text-primary" />
                      Section-by-Section Concrete Improvements
                    </h4>
                    <div className="space-y-3">
                      {a.sectionImprovements.map((imp, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border bg-secondary/15 p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground">
                              {imp.section}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase font-bold text-warning border-warning/30 bg-warning/10"
                            >
                              Identified Gap
                            </Badge>
                          </div>
                          {imp.currentGap && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              <strong className="text-foreground/80">Flaw: </strong>
                              {imp.currentGap}
                            </p>
                          )}
                          {imp.actionableFix && (
                            <div className="text-xs text-success bg-success/10 border border-success/30 p-2.5 rounded-lg flex items-start gap-1.5">
                              <Check className="size-4 shrink-0 mt-0.5 text-success font-bold" />
                              <span>
                                <strong className="text-foreground">Actionable Fix: </strong>
                                {imp.actionableFix}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Priority Skills to Master */}
                <RoadmapBlock
                  title="Priority Technical Tools to Master (Ordered by Hiring Impact)"
                  icon={<Wrench className="size-4 text-primary" />}
                  items={
                    a.skillMatrix.recommended.length > 0
                      ? a.skillMatrix.recommended
                      : a.techImprovementIdeas
                  }
                />

                {/* Placement & Interview Strategy Tips */}
                {a.placementTips && a.placementTips.length > 0 && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <Target className="size-4" /> Tactical Placement &amp; Interview Tips
                    </h4>
                    <ul className="space-y-2">
                      {a.placementTips.map((tip, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-foreground leading-relaxed"
                        >
                          <span className="font-bold text-primary select-none mt-0.5">✓</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Portfolio Project Suggestions */}
                <RoadmapBlock
                  title="Recommended Portfolio Projects with System Architecture"
                  icon={<Lightbulb className="size-4 text-accent" />}
                  items={a.projectSuggestions}
                />
              </TabsContent>

              {/* Tab: Bullet Rewrites */}
              <TabsContent value="rewrites" className="mt-0 space-y-4">
                {a.bulletRewrites.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No bullet rewrites suggested.</p>
                ) : (
                  <div className="space-y-4">
                    {a.bulletRewrites.map((r, i) => (
                      <div
                        key={i}
                        className="space-y-3 rounded-xl border border-border bg-secondary/15 p-4"
                      >
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Original Bullet
                          </span>
                          <p className="mt-1 rounded-lg bg-secondary/40 border border-border px-3 py-2 text-xs text-foreground/80">
                            {r.original}
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-success">
                            Optimized Bullet (Action Verb + Tech Stack + Outcome)
                          </span>
                          <div className="mt-1 flex items-start gap-2 rounded-lg bg-success/10 border border-success/30 p-3">
                            <ArrowRight className="mt-0.5 size-4 shrink-0 text-success" />
                            <p className="text-xs font-semibold text-foreground leading-relaxed">
                              {r.rewritten}
                            </p>
                          </div>
                        </div>

                        {r.reason && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground/80">Rationale: </span>
                            {r.reason}
                          </p>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg"
                          onClick={() => copyText(r.rewritten)}
                        >
                          <Copy className="size-3 mr-1.5" /> Copy Rewritten Bullet
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Tab: Issues & Red Flags */}
              <TabsContent value="issues" className="mt-0 space-y-4">
                {a.criticalIssues.length === 0 ? (
                  <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
                    <CheckCircle2 className="mx-auto size-8 text-success mb-2" />
                    <p className="text-sm font-semibold text-foreground">
                      No Critical Red Flags Detected
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This resume is clear of major dealbreakers.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {a.criticalIssues.map((issue, i) => (
                      <div
                        key={i}
                        className="space-y-2.5 rounded-xl border border-border bg-secondary/15 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            {issue.severity === "critical" ? (
                              <XCircle className="size-4 text-destructive" />
                            ) : (
                              <AlertTriangle className="size-4 text-warning" />
                            )}
                            {issue.problem}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {issue.area}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${sevTone(issue.severity)}`}
                            >
                              {issue.severity}
                            </Badge>
                          </div>
                        </div>

                        {issue.evidence && (
                          <div className="rounded-lg bg-secondary/50 border border-border/80 px-3 py-2 text-xs font-mono text-foreground/80">
                            <span className="text-muted-foreground select-none">Quote: </span>"
                            {issue.evidence}"
                          </div>
                        )}

                        {issue.fix && (
                          <div className="rounded-lg bg-success/10 border border-success/30 p-2.5 text-xs text-foreground">
                            <span className="font-bold text-success">Recommended Action: </span>
                            {issue.fix}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Tab: Skills & Gaps */}
              <TabsContent value="skills" className="mt-0 space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <SkillBlock
                    title="Verified Core Skills"
                    items={a.skillMatrix.matched}
                    tone="border-success/30 bg-success/5"
                    badgeClass="bg-success/15 text-success border-success/30"
                    empty="No clear core skills verified"
                  />
                  <SkillBlock
                    title="Missing / Underrepresented"
                    items={a.skillMatrix.missing}
                    tone="border-destructive/30 bg-destructive/5"
                    badgeClass="bg-destructive/15 text-destructive border-destructive/30"
                    empty="No critical skill gaps found"
                  />
                  <SkillBlock
                    title="Recommended to Add"
                    items={a.skillMatrix.recommended}
                    tone="border-primary/30 bg-primary/5"
                    badgeClass="bg-primary/15 text-primary border-primary/30"
                    empty="No immediate skill additions needed"
                  />
                </div>
              </TabsContent>

              {/* Tab: Strengths */}
              <TabsContent value="strengths" className="mt-0 space-y-4">
                <div className="rounded-xl border border-success/30 bg-success/5 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-success flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" /> Verified Candidate Strengths
                  </h4>
                  {a.strengths.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No notable strengths recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {a.strengths.map((s, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-foreground leading-relaxed"
                        >
                          <Check className="size-4 shrink-0 text-success mt-0.5" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>

        {/* Fixed Officer Override & Notes Footer */}
        <div className="border-t border-border bg-secondary/30 px-6 py-3.5 shrink-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="override" className="text-xs font-semibold text-muted-foreground">
                Score Override
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="override"
                  type="number"
                  min={0}
                  max={100}
                  value={manual}
                  placeholder="0-100"
                  onChange={(e) => setManual(e.target.value)}
                  className="h-8 w-24 text-xs font-mono font-bold"
                />
                {manual && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setManual("")}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>

            <div className="min-w-[240px] flex-1 space-y-1">
              <Label htmlFor="notes" className="text-xs font-semibold text-muted-foreground">
                Officer Notes (Included in CSV &amp; PDF Exports)
              </Label>
              <Input
                id="notes"
                value={notes}
                placeholder="e.g. Strong core logic, recommend coding rounds prep"
                onChange={(e) => setNotes(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <Button
              size="sm"
              variant="default"
              onClick={handleSave}
              className="h-8 text-xs font-semibold rounded-lg shadow-sm"
            >
              <Check className="size-3.5 mr-1.5" /> Save Changes
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SkillBlock({
  title,
  items,
  tone,
  badgeClass,
  empty,
}: {
  title: string;
  items: string[];
  tone: string;
  badgeClass: string;
  empty: string;
}) {
  return (
    <div className={`space-y-3 rounded-xl border p-4 ${tone}`}>
      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((skill, i) => (
            <Badge
              key={i}
              variant="outline"
              className={`rounded-md text-xs font-medium ${badgeClass}`}
            >
              {skill}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function RoadmapBlock({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/15 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
        {icon}
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No specific suggestions.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-foreground leading-relaxed">
              <span className="font-bold text-primary select-none mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
