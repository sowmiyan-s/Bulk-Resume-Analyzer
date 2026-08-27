import { useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
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
  Zap,
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
import { runAtsEngine, type AtsReport } from "@/lib/ats-engine";
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
  if (s === "major") return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "border-border bg-secondary/40 text-muted-foreground";
}

function sevBadge(s: Issue["severity"]) {
  if (s === "critical")
    return "bg-destructive text-destructive-foreground border-destructive text-[10px] font-bold uppercase tracking-wider";
  if (s === "major")
    return "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[10px] font-bold uppercase tracking-wider";
  return "bg-secondary text-muted-foreground border-border text-[10px] font-medium uppercase tracking-wider";
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
  const atsData: AtsReport = a.ats ?? runAtsEngine(target.cleanText || target.rawText || "");
  const currentScore = effectiveScore(a);
  const jdScoreVal =
    typeof a.jdScore === "number"
      ? a.jdScore
      : Math.max(0, Math.min(100, Math.round(currentScore * 0.88)));

  const totalIssues = (a.criticalIssues || []).length;
  const criticalCount = (a.criticalIssues || []).filter((i) => i.severity === "critical").length;
  const totalMissing = (a.skillMatrix?.missing || []).length;
  const totalRewrites = (a.bulletRewrites || []).length;

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
        {/* Classy Fixed Header */}
        <SheetHeader className="border-b border-border bg-card px-6 py-4 shrink-0 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ScoreRing
                value={currentScore}
                label={a.manualScore !== null ? "OVERRIDE" : "ATS FIT"}
                size={62}
              />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-lg font-bold text-foreground tracking-tight">
                    {a.candidateName}
                  </SheetTitle>

                  {/* Readiness Status Pill */}
                  <Badge
                    variant="outline"
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${tierTone(
                      a.readinessTier,
                    )}`}
                  >
                    {a.readinessTier}
                  </Badge>

                  {/* JD Match Pill */}
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/10 text-primary text-xs font-bold px-2.5 py-0.5 rounded-full"
                  >
                    🎯 {jdScoreVal}% JD Match
                  </Badge>

                  {/* Role Arc Pill */}
                  {a.roleArc && a.roleArc !== "—" && (
                    <Badge
                      variant="outline"
                      className="border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    >
                      🧭 {a.roleArc}
                    </Badge>
                  )}
                </div>

                <SheetDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>
                    Target Role: <span className="font-semibold text-foreground">{a.role}</span>
                  </span>
                  <span className="opacity-40">·</span>
                  <span className="font-mono text-muted-foreground truncate max-w-xs">
                    {target.fileName}
                  </span>
                </SheetDescription>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2">
              {hasActiveJd && onReanalyzeWithJd ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-medium rounded-lg border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => onReanalyzeWithJd(target.id)}
                  title="Re-evaluate candidate against current Job Description"
                >
                  <RefreshCw className="size-3.5 mr-1.5" /> Re-evaluate (JD)
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-medium rounded-lg hover:bg-secondary"
                  onClick={() => onReanalyze(target.id)}
                >
                  <RefreshCw className="size-3.5 mr-1.5" /> Re-evaluate
                </Button>
              )}
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs font-semibold rounded-lg shadow-xs"
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

        {/* Unified Scrollable Body with Clean Sticky Tab Navigation */}
        <Tabs defaultValue="mistakes" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {/* Top HR Executive Snapshot */}
            <div className="border-b border-border bg-muted/20 p-5 space-y-4">
              <div className="grid gap-4 lg:grid-cols-12">
                {/* Recruiter Impression & Placement Verdict */}
                <div className="space-y-3 lg:col-span-7">
                  {a.recruiterFirstImpression && (
                    <div className="rounded-xl border border-primary/20 bg-background/80 p-3.5 shadow-2xs space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <Target className="size-3.5" /> Recruiter's 6-Second Impression
                      </p>
                      <p className="text-xs text-foreground/90 leading-relaxed">
                        "{a.recruiterFirstImpression}"
                      </p>
                    </div>
                  )}

                  {a.hrVerdict && (
                    <div className="rounded-xl border border-border bg-background/80 p-3.5 shadow-2xs space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Award className="size-3.5 text-accent" /> Placement Officer Verdict
                      </p>
                      <p className="text-xs text-foreground leading-relaxed font-medium">
                        {a.hrVerdict}
                      </p>
                    </div>
                  )}

                  {a.jdVerdict && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed flex items-start gap-2">
                      <Zap className="size-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-foreground">JD Alignment Note: </span>
                        <span className="text-muted-foreground">{a.jdVerdict}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section Competency Breakdown Bars */}
                <div className="rounded-xl border border-border bg-background/80 p-4 space-y-2.5 lg:col-span-5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Competency Breakdown
                    </p>
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                      Total: 100 pts
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {a.scoreBreakdown.map((row, i) => {
                      const pct = row.max ? Math.round((row.score / row.max) * 100) : 0;
                      const toneColor =
                        pct >= 75
                          ? "text-emerald-600 dark:text-emerald-400"
                          : pct >= 55
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-rose-600 dark:text-rose-400";
                      const barBg =
                        pct >= 75
                          ? "bg-emerald-500"
                          : pct >= 55
                            ? "bg-amber-500"
                            : "bg-rose-500";
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground truncate max-w-[14rem]">
                              {row.category}
                            </span>
                            <span className={`font-mono text-xs font-bold ${toneColor}`}>
                              {row.score}
                              <span className="text-muted-foreground font-normal">/{row.max}</span>
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-secondary/80 overflow-hidden">
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

            {/* Classy Sticky 4-Tab Navigation Bar */}
            <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md px-6 py-2">
              <TabsList className="h-10 gap-1 bg-secondary/50 p-1 rounded-xl w-full justify-start overflow-x-auto">
                <TabsTrigger
                  value="mistakes"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs rounded-lg px-3.5 py-1.5 font-semibold transition-all"
                >
                  <AlertTriangle className="size-3.5 mr-1.5 text-rose-500" />
                  Mistakes &amp; Red Flags
                  {totalIssues > 0 && (
                    <span
                      className={`ml-1.5 px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                        criticalCount > 0
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {totalIssues}
                    </span>
                  )}
                </TabsTrigger>

                <TabsTrigger
                  value="skills"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs rounded-lg px-3.5 py-1.5 font-semibold transition-all"
                >
                  <Layers className="size-3.5 mr-1.5 text-primary" />
                  Skills &amp; Matching
                  {totalMissing > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-primary/15 text-primary">
                      {totalMissing} missing
                    </span>
                  )}
                </TabsTrigger>

                <TabsTrigger
                  value="improvements"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs rounded-lg px-3.5 py-1.5 font-semibold transition-all"
                >
                  <Sparkles className="size-3.5 mr-1.5 text-emerald-500" />
                  Actionable Fixes &amp; Rewrites
                  {totalRewrites > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                      {totalRewrites}
                    </span>
                  )}
                </TabsTrigger>

                <TabsTrigger
                  value="ats"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs rounded-lg px-3.5 py-1.5 font-semibold transition-all"
                >
                  <Zap className="size-3.5 mr-1.5 text-amber-500" />
                  ATS Scan ({atsData.score}/100)
                </TabsTrigger>
              </TabsList>
            </div>

            {/* TAB CONTENTS */}
            <div className="p-6 space-y-6">
              {/* TAB 1: MISTAKES & RED FLAGS */}
              <TabsContent value="mistakes" className="mt-0 space-y-5">
                {/* Header overview */}
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <AlertCircle className="size-4 text-rose-500" />
                      Critical Resume Gaps &amp; Formatting Blockers
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Review identified mistakes that hurt ATS pass rates or disqualify the candidate in recruiter scans.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono font-bold">
                    {totalIssues === 0 ? "0 Issues" : `${totalIssues} Total Issues`}
                  </Badge>
                </div>

                {/* Hard ATS Blockers Alert */}
                {atsData.blockers.length > 0 && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs uppercase tracking-wider">
                      <XCircle className="size-4" /> ATS Parsing Hard Blockers ({atsData.blockers.length})
                    </div>
                    <ul className="space-y-1.5 pl-1">
                      {atsData.blockers.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-foreground font-medium">
                          <span className="text-rose-500 font-bold">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Critical & Major Issues List */}
                {a.criticalIssues.length > 0 ? (
                  <div className="grid gap-3">
                    {a.criticalIssues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl border p-4 space-y-2.5 transition-all bg-card/60 ${sevTone(
                          issue.severity,
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className={sevBadge(issue.severity)}>
                              {issue.severity}
                            </Badge>
                            <span className="text-xs font-bold text-foreground">
                              {issue.area}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div>
                            <span className="font-semibold text-foreground">Problem: </span>
                            <span className="text-foreground/90">{issue.problem}</span>
                          </div>
                          {issue.evidence && (
                            <div className="bg-background/80 p-2 rounded-md border border-border/60 text-muted-foreground text-[11px] font-mono">
                              <strong className="text-foreground font-sans">Evidence from resume: </strong>
                              {issue.evidence}
                            </div>
                          )}
                          {issue.fix && (
                            <div className="flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium pt-1">
                              <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />
                              <span>
                                <strong className="text-foreground">Immediate Fix: </strong>
                                {issue.fix}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center space-y-1.5">
                    <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
                    <h4 className="text-xs font-bold text-foreground">No Critical Issues Detected</h4>
                    <p className="text-xs text-muted-foreground">
                      This resume has clean technical framing and no severe ATS red flags.
                    </p>
                  </div>
                )}

                {/* Data Gaps & Formatting Problems */}
                <div className="grid gap-4 sm:grid-cols-2 pt-2">
                  {/* Missing Elements / Data Gaps */}
                  <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <AlertCircle className="size-3.5 text-amber-500" />
                      Missing Data &amp; Verification Gaps
                    </h4>
                    {a.dataGaps && a.dataGaps.length > 0 ? (
                      <ul className="space-y-2">
                        {a.dataGaps.map((g, i) => (
                          <li key={i} className="text-xs text-foreground/90 bg-background/80 p-2.5 rounded-lg border border-border/60 space-y-0.5">
                            <p className="font-semibold text-foreground">{g.area}: {g.missing}</p>
                            <p className="text-[11px] text-muted-foreground">{g.impact}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">All standard sections &amp; contact info present.</p>
                    )}
                  </div>

                  {/* Formatting & OCR Anomalies */}
                  <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Wrench className="size-3.5 text-primary" />
                      Formatting &amp; Scannability Flags
                    </h4>
                    {a.formattingProblems.length > 0 || a.grammarAndOcrErrors.length > 0 ? (
                      <ul className="space-y-2">
                        {[...a.formattingProblems, ...a.grammarAndOcrErrors].map((item, i) => (
                          <li key={i} className="text-xs text-foreground/90 bg-background/80 p-2.5 rounded-lg border border-border/60 flex items-start gap-1.5">
                            <span className="text-amber-500 font-bold">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Clean formatting hygiene and ATS scannable typography.</p>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: SKILLS & ROLE MATCHING */}
              <TabsContent value="skills" className="mt-0 space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Code2 className="size-4 text-primary" />
                      Verified Skills &amp; Technical Competency Matrix
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Exact breakdown of verified candidate skills vs missing role/JD keywords.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-bold text-primary bg-primary/10 border-primary/30">
                    🎯 {jdScoreVal}% Alignment
                  </Badge>
                </div>

                {/* Skills Grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Verified Skills */}
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                        Verified Skills Found ({a.skillMatrix.matched.length})
                      </h4>
                    </div>
                    {a.skillMatrix.matched.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {a.skillMatrix.matched.map((s, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-medium px-2 py-0.5 rounded-md"
                          >
                            ✓ {s}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No verifiable technical skills found in resume.</p>
                    )}
                  </div>

                  {/* Missing Critical Skills */}
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <XCircle className="size-3.5 text-rose-500" />
                        Missing Critical Skills ({a.skillMatrix.missing.length})
                      </h4>
                    </div>
                    {a.skillMatrix.missing.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {a.skillMatrix.missing.map((s, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 text-xs font-medium px-2 py-0.5 rounded-md"
                          >
                            ✕ {s}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Candidate meets all major keyword requirements for this role!
                      </p>
                    )}
                  </div>
                </div>

                {/* Priority Technologies to Learn */}
                <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <TrendingUp className="size-3.5 text-primary" />
                    Priority Tech Stack to Learn / Elevate
                  </h4>
                  {a.skillMatrix.recommended.length > 0 || a.techImprovementIdeas.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[...a.skillMatrix.recommended, ...a.techImprovementIdeas]
                        .filter((v, i, arr) => arr.indexOf(v) === i)
                        .map((tech, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 bg-background/80 p-2.5 rounded-lg border border-border/60 text-xs font-medium text-foreground"
                          >
                            <span className="size-1.5 rounded-full bg-primary" />
                            <span>{tech}</span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Candidate profile has modern tooling coverage.</p>
                  )}
                </div>

                {/* Project Complexity & Architecture Audit */}
                {sec?.projects && (
                  <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <Cpu className="size-3.5 text-primary" />
                        Project Architecture &amp; Engineering Depth
                      </h4>
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                        {sec.projects.score} / {sec.projects.max} pts
                      </span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed bg-background/80 p-3 rounded-lg border border-border/60">
                      {sec.projects.audit}
                    </p>
                    {sec.projects.fixTip && (
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg flex items-start gap-1.5">
                        <Sparkles className="size-3.5 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-foreground">Architecture Polish: </strong>
                          {sec.projects.fixTip}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* TAB 3: ACTIONABLE IMPROVEMENTS & REWRITES */}
              <TabsContent value="improvements" className="mt-0 space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="size-4 text-emerald-500" />
                      Concrete Action Plan &amp; Bullet Rewrites
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ready-to-copy bullet point upgrades with quantifiable metrics and architectural improvements.
                    </p>
                  </div>
                </div>

                {/* High-Impact Bullet Rewrites */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Zap className="size-3.5 text-amber-500" />
                    High-Impact Bullet Point Rewrites ({a.bulletRewrites.length})
                  </h4>
                  {a.bulletRewrites.length > 0 ? (
                    <div className="grid gap-3.5">
                      {a.bulletRewrites.map((rw, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs"
                        >
                          {/* Original Weak Bullet */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                Original Bullet (Weak / Unquantified)
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/20 text-xs text-foreground/80 line-through opacity-80">
                              {rw.original}
                            </div>
                          </div>

                          {/* Elevated Rewritten Bullet */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1">
                                <Sparkles className="size-3 text-emerald-500" />
                                Recommended ATS Rewrite (Metrics &amp; Stack)
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[11px] px-2 text-primary hover:bg-primary/10 rounded-md"
                                onClick={() => copyText(rw.rewritten)}
                              >
                                <Copy className="size-3 mr-1" /> Copy
                              </Button>
                            </div>
                            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-foreground font-medium leading-relaxed">
                              {rw.rewritten}
                            </div>
                          </div>

                          {rw.reason && (
                            <p className="text-[11px] text-muted-foreground italic pl-1">
                              💡 Why this works: {rw.reason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-border bg-secondary/20 text-xs text-muted-foreground text-center">
                      No automated bullet rewrites needed. Current bullets have sufficient action verb and metrics depth.
                    </div>
                  )}
                </div>

                {/* Step-by-Step Section Improvements */}
                {a.sectionImprovements && a.sectionImprovements.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      Step-by-Step Section Polish ({a.sectionImprovements.length})
                    </h4>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {a.sectionImprovements.map((si, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border bg-secondary/20 p-3.5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground">
                              {si.section}
                            </span>
                            <span className="text-[10px] text-rose-500 font-medium">
                              {si.currentGap}
                            </span>
                          </div>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-start gap-1">
                            <span className="font-bold">→</span> {si.actionableFix}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Placement & Interview Prep Tips */}
                {a.placementTips && a.placementTips.length > 0 && (
                  <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Lightbulb className="size-3.5 text-amber-500" />
                      Interview Strategy &amp; Placement Round Tips
                    </h4>
                    <ul className="space-y-2">
                      {a.placementTips.map((tip, i) => (
                        <li
                          key={i}
                          className="text-xs text-foreground bg-background/80 p-2.5 rounded-lg border border-border/60 flex items-start gap-2 leading-relaxed"
                        >
                          <span className="text-primary font-bold select-none">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>

              {/* TAB 4: ATS COMPLIANCE SCAN */}
              <TabsContent value="ats" className="mt-0 space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Zap className="size-4 text-amber-500" />
                      ATS Engine Technical Verification
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deterministic, rule-based ATS compliance audit calculated directly from document text.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                    {atsData.score}/100 ATS Score
                  </Badge>
                </div>

                {/* Metrics Chips Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Words
                    </span>
                    <span className="font-mono font-bold text-sm text-foreground">
                      {atsData.metrics.words}
                    </span>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Bullets
                    </span>
                    <span className="font-mono font-bold text-sm text-foreground">
                      {atsData.metrics.bullets}
                    </span>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Quantified
                    </span>
                    <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      {atsData.metrics.quantifiedBullets}
                    </span>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Action Verbs
                    </span>
                    <span className="font-mono font-bold text-sm text-primary">
                      {atsData.metrics.actionVerbBullets}
                    </span>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Pages
                    </span>
                    <span className="font-mono font-bold text-sm text-foreground">
                      ~{atsData.metrics.estimatedPages}
                    </span>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Max Words/Bullet
                    </span>
                    <span className="font-mono font-bold text-sm text-foreground">
                      {atsData.metrics.longestBulletWords}
                    </span>
                  </div>
                </div>

                {/* 5 Technical Categories List */}
                <div className="space-y-3">
                  {atsData.categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="rounded-xl border border-border bg-secondary/15 p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          {cat.label}
                        </span>
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {cat.score} / {cat.max} pts
                        </span>
                      </div>
                      <div className="grid gap-1.5">
                        {cat.checks.map((k) => (
                          <div
                            key={k.id}
                            className="flex items-center justify-between text-xs p-2 rounded-lg bg-background/80 border border-border/60"
                          >
                            <div className="flex items-center gap-2">
                              {k.passed ? (
                                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <XCircle className="size-3.5 text-rose-500 shrink-0" />
                              )}
                              <span className="text-foreground">{k.label}</span>
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {k.points}/{k.max} pts
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </div>
          </div>

          {/* Classy Footer: Score Override & Officer Notes */}
          <div className="border-t border-border bg-card p-4 shrink-0 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <Label htmlFor="manual" className="text-[11px] font-semibold text-muted-foreground block">
                    Score Override (0-100)
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="manual"
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
              </div>

              <div className="min-w-[240px] flex-1 space-y-1">
                <Label htmlFor="notes" className="text-[11px] font-semibold text-muted-foreground block">
                  Placement Officer Notes (Included in CSV &amp; PDF Exports)
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
                className="h-8 text-xs font-semibold rounded-lg shadow-xs mt-auto"
              >
                <Check className="size-3.5 mr-1.5" /> Save Changes
              </Button>
            </div>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
