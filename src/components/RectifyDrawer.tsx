import { useEffect, useRef, useState, useTransition } from "react";
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
  LayoutDashboard,
  Lightbulb,
  RefreshCw,
  Sparkles,
  SpellCheck,
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
import { effectiveScore, tierTone, type Analysis, type Issue } from "@/lib/analysis-types";
import type { GrammarIssue } from "@/lib/grammar-engine";
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

type NavSection = "overview" | "mistakes" | "grammar" | "skills" | "rewrites" | "projects" | "ats";

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
  const [activeNav, setActiveNav] = useState<NavSection>("overview");
  const [notes, setNotes] = useState("");
  const [manual, setManual] = useState<string>("");
  const [, startTransition] = useTransition();
  const prevTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (target?.analysis) {
      // Only reset activeNav and input fields when the user switches to a different candidate
      if (prevTargetIdRef.current !== target.id) {
        prevTargetIdRef.current = target.id;
        setNotes(target.analysis.officerNotes ?? "");
        setManual(
          target.analysis.manualScore !== null && target.analysis.manualScore !== undefined
            ? String(target.analysis.manualScore)
            : "",
        );
        setActiveNav("overview");
      }
    } else {
      prevTargetIdRef.current = null;
    }
  }, [target?.id, target?.analysis]);

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
  const grammarIssues: GrammarIssue[] = atsData.metrics?.grammarIssues ?? [];
  const genAiGrammarList = a.grammarAndOcrErrors || [];
  const grammarCount = grammarIssues.length > 0 ? grammarIssues.length : genAiGrammarList.length;

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

  const handleCopyReview = () => {
    const lines = [
      `==================================================`,
      `CANDIDATE RESUME REVIEW & SCREENING FEEDBACK`,
      `==================================================`,
      `Candidate: ${a.candidateName}`,
      `Target Role: ${a.role}`,
      `Evaluation Score: ${currentScore}/100 (${a.readinessTier})`,
      ...(typeof a.jdScore === "number" ? [`JD Match Fit: ${a.jdScore}%`] : []),
      "",
      `--- HR / PLACEMENT VERDICT ---`,
      a.hrVerdict || a.recruiterFirstImpression || "Profile evaluated against target requirements.",
      "",
      `--- KEY STRENGTHS ---`,
      ...(a.strengths && a.strengths.length > 0
        ? a.strengths.map((s) => `✔ ${s}`)
        : ["✔ Foundational technical knowledge present."]),
      "",
      `--- MISTAKES & CRITICAL ISSUES TO REVISE ---`,
      ...(a.criticalIssues && a.criticalIssues.length > 0
        ? a.criticalIssues.map((ci, i) => `${i + 1}. [${ci.area}] ${ci.problem}\n   -> ACTION FIX: ${ci.fix}`)
        : atsData.blockers.length > 0
          ? atsData.blockers.map((b, i) => `${i + 1}. [ATS Blocker] ${b}`)
          : ["• No critical structural blockers detected."]),
      "",
      ...(a.skillMatrix?.missing && a.skillMatrix.missing.length > 0
        ? [
            `--- MISSING REQUIRED SKILLS ---`,
            `The following skills required for this role were not found in your resume:`,
            `• ${a.skillMatrix.missing.join(", ")}`,
            "",
          ]
        : []),
      ...(a.bulletRewrites && a.bulletRewrites.length > 0
        ? [
            `--- BULLET POINT REWRITE EXAMPLE ---`,
            `Before: "${a.bulletRewrites[0].original}"`,
            `After:  "${a.bulletRewrites[0].rewritten}"`,
            `Why:    ${a.bulletRewrites[0].reason}`,
            "",
          ]
        : []),
      `==================================================`,
    ];

    void navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Full candidate feedback review copied to clipboard!");
  };

  const sec = a.sectionAudits;

  const navItems = [
    {
      id: "overview" as NavSection,
      label: "Executive Fit & Verdict",
      icon: LayoutDashboard,
      badge: `${currentScore}/100`,
      badgeColor: "bg-primary/10 text-primary border-primary/20",
    },
    {
      id: "mistakes" as NavSection,
      label: "Mistakes & Red Flags",
      icon: AlertTriangle,
      badge: totalIssues > 0 ? `${totalIssues}` : "0",
      badgeColor:
        criticalCount > 0
          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold"
          : totalIssues > 0
            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
            : "bg-muted text-muted-foreground",
    },
    {
      id: "skills" as NavSection,
      label: a.evaluationBasis === "jd-fit" ? "Skills & JD Matching" : "Skills & SDE Core",
      icon: Layers,
      badge: totalMissing > 0 ? `${totalMissing} missing` : "100%",
      badgeColor:
        totalMissing > 0
          ? "bg-primary/15 text-primary border-primary/30"
          : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    },
    {
      id: "grammar" as NavSection,
      label: "Spelling & Grammar",
      icon: SpellCheck,
      badge: grammarCount > 0 ? `${grammarCount}` : "✓",
      badgeColor:
        grammarCount > 5
          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold"
          : grammarCount > 0
            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
            : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    },
    {
      id: "rewrites" as NavSection,
      label: "Bullet Fixes & Tips",
      icon: Sparkles,
      badge: totalRewrites > 0 ? `${totalRewrites}` : null,
      badgeColor: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "projects" as NavSection,
      label: "Project & Architecture",
      icon: Cpu,
      badge: sec?.projects ? `${sec.projects.score}/${sec.projects.max}` : null,
      badgeColor: "bg-muted text-muted-foreground",
    },
    {
      id: "ats" as NavSection,
      label: "Technical ATS Scan",
      icon: Zap,
      badge: `${atsData.score}`,
      badgeColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 sm:max-w-[min(98vw,1120px)] shadow-2xl overflow-hidden"
      >
        {/* Top Header Bar */}
        <SheetHeader className="border-b border-border bg-card px-6 py-3.5 shrink-0 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-lg font-bold text-foreground tracking-tight">
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
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/10 text-primary text-xs font-bold px-2.5 py-0.5 rounded-full"
                  >
                    {a.evaluationBasis === "jd-fit" ? `🎯 ${jdScoreVal}% JD Match` : `🌐 ${jdScoreVal}% Global SDE Fit`}
                  </Badge>
                </div>
                <SheetDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                  <span>
                    Target: <strong className="text-foreground">{a.role}</strong>
                  </span>
                  <span className="opacity-40">·</span>
                  <span className="font-mono text-muted-foreground truncate max-w-xs">
                    {target.fileName}
                  </span>
                </SheetDescription>
              </div>
            </div>

            {/* Quick Actions */}
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
                variant="outline"
                className="h-8 text-xs font-semibold rounded-lg border-border hover:bg-secondary text-foreground"
                onClick={handleCopyReview}
                title="Copy complete structured review with candidate mistakes, strengths, and fixes to clipboard"
              >
                <Copy className="size-3.5 mr-1.5 text-primary" /> Copy Review
              </Button>
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

        {/* 2-Column Inside Navigation & Content Layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Inside Sidebar */}
          <aside className="w-56 sm:w-64 border-r border-border bg-muted/25 flex flex-col shrink-0">
            {/* Candidate Summary Card inside sidebar */}
            <div className="p-4 border-b border-border/80 bg-background/50 flex items-center gap-3">
              <ScoreRing
                value={currentScore}
                label={a.manualScore !== null ? "OVERRIDE" : "ATS FIT"}
                size={54}
              />
              <div className="space-y-0.5 min-w-0">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
                  Overall Rating
                </span>
                <p className="text-xs font-bold text-foreground truncate">
                  {a.readinessTier.replace(/^Tier \d: /, "")}
                </p>
                <span className="text-[11px] font-mono font-semibold text-primary block">
                  🎯 {jdScoreVal}% Match
                </span>
              </div>
            </div>

            {/* Nav Menu */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground px-2.5 py-1 block tracking-wider">
                Report Sections
              </span>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`size-4 shrink-0 ${
                          isActive ? "text-primary-foreground" : "text-primary"
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md shrink-0 border ${
                          isActive
                            ? "bg-primary-foreground/20 text-primary-foreground border-transparent"
                            : item.badgeColor
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sidebar Bottom Archetype / Tooling Info */}
            <div className="p-3 border-t border-border/80 bg-background/50 space-y-1.5">
              {a.roleArc && a.roleArc !== "—" && (
                <div className="text-[11px] font-medium text-foreground/90 flex items-center gap-1.5 truncate">
                  <span className="text-violet-500">🧭</span>
                  <span className="truncate" title={a.roleArc}>
                    {a.roleArc}
                  </span>
                </div>
              )}
              {a.toolTaxonomy?.tools?.length > 0 && (
                <div className="text-[10px] text-muted-foreground truncate" title={a.toolTaxonomy.tools.join(", ")}>
                  🤖 {a.toolTaxonomy.tools.slice(0, 2).join(", ")}
                  {a.toolTaxonomy.tools.length > 2 ? "…" : ""}
                </div>
              )}
            </div>
          </aside>

          {/* Right Main Content Area */}
          <main className="flex-1 min-w-0 flex flex-col bg-background">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* SECTION 1: EXECUTIVE FIT & VERDICT */}
              {activeNav === "overview" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <LayoutDashboard className="size-4 text-primary" />
                      Executive Fit &amp; Hiring Verdict
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      High-level assessment summary, placement readiness, and competency point distribution.
                    </p>
                  </div>

                  {/* Recruiter Impression & Placement Verdict Cards */}
                  <div className="grid gap-3.5">
                    {a.recruiterFirstImpression && (
                      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-2xs space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                          <Target className="size-3.5" /> Recruiter's 6-Second First Impression
                        </p>
                        <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                          "{a.recruiterFirstImpression}"
                        </p>
                      </div>
                    )}

                    {a.hrVerdict && (
                      <div className="rounded-xl border border-border bg-secondary/20 p-4 shadow-2xs space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Award className="size-3.5 text-accent" /> Placement Officer Verdict
                        </p>
                        <p className="text-xs text-foreground leading-relaxed font-medium">
                          {a.hrVerdict}
                        </p>
                      </div>
                    )}

                    {a.jdVerdict && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs leading-relaxed flex items-start gap-2.5">
                        <Zap className="size-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-foreground">
                            {a.evaluationBasis === "jd-fit" ? "Target JD Alignment: " : "Global SDE Baseline Alignment: "}
                          </span>
                          <span className="text-muted-foreground">{a.jdVerdict}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section Competency Breakdown */}
                  <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Section Competency Breakdown (100 Pts Total)
                      </p>
                      <span className="text-xs font-mono font-bold text-primary">
                        Score: {currentScore}/100
                      </span>
                    </div>

                    <div className="grid gap-3">
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
                          <div key={i} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground">
                                {row.category}
                              </span>
                              <span className={`font-mono text-xs font-bold ${toneColor}`}>
                                {row.score}
                                <span className="text-muted-foreground font-normal">/{row.max} pts</span>
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                              <div
                                className={`h-full rounded-full ${barBg} transition-all duration-500`}
                                style={{ width: `${Math.max(4, pct)}%` }}
                              />
                            </div>
                            {row.note && (
                              <p className="text-[11px] text-muted-foreground italic">
                                {row.note}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: MISTAKES & RED FLAGS */}
              {activeNav === "mistakes" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <AlertTriangle className="size-4 text-rose-500" />
                        Mistakes, Gaps &amp; Red Flags
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Identified issues that hurt ATS pass rates or disqualify the candidate in recruiter screenings.
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

                  {/* Critical & Major Issues */}
                  {a.criticalIssues.length > 0 ? (
                    <div className="grid gap-3">
                      {a.criticalIssues.map((issue, idx) => (
                        <div
                          key={idx}
                          className={`rounded-xl border p-4 space-y-2.5 transition-all bg-card ${sevTone(
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
                              <div className="bg-background/80 p-2.5 rounded-lg border border-border/60 text-muted-foreground text-[11px] font-mono">
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

                  {/* Formatting & Missing Data Flags */}
                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
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

                    <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <Wrench className="size-3.5 text-primary" />
                        Formatting &amp; Scannability Flags
                      </h4>
                      {a.formattingProblems.length > 0 ? (
                        <ul className="space-y-2">
                          {a.formattingProblems.map((item, i) => (
                            <li key={i} className="text-xs text-foreground/90 bg-background/80 p-2.5 rounded-lg border border-border/60 flex items-start gap-1.5">
                              <span className="text-amber-500 font-bold">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">Clean formatting hygiene and ATS scannable single-column layout.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: SPELLING & GRAMMAR AUDIT */}
              {activeNav === "grammar" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <SpellCheck className="size-4 text-primary" />
                        Spelling &amp; Grammar Audit
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Every spelling mistake, grammar error, punctuation issue, and phrasing problem detected in the resume — with exact fixes.
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-xs font-mono font-bold ${grammarCount > 0 ? "text-rose-600 border-rose-500/40 bg-rose-500/10" : "text-emerald-600 border-emerald-500/40 bg-emerald-500/10"}`}>
                      {grammarCount === 0 ? "✓ Clean" : `${grammarCount} Issues`}
                    </Badge>
                  </div>

                  {grammarIssues.length > 0 || genAiGrammarList.length > 0 ? (
                    <div className="space-y-4">
                      {/* Deterministic Grammar / Spelling Issues */}
                      {grammarIssues.length > 0 && (
                        <>
                          {/* Summary Counts by Type */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {(["spelling", "grammar", "punctuation", "phrasing", "capitalization", "repetition", "ocr"] as const)
                              .map((type) => {
                                const count = grammarIssues.filter((i) => i.type === type).length;
                                if (count === 0) return null;
                                const colors: Record<string, string> = {
                                  spelling: "text-rose-600 bg-rose-500/10 border-rose-500/30",
                                  grammar: "text-amber-600 bg-amber-500/10 border-amber-500/30",
                                  punctuation: "text-sky-600 bg-sky-500/10 border-sky-500/30",
                                  phrasing: "text-violet-600 bg-violet-500/10 border-violet-500/30",
                                  capitalization: "text-orange-600 bg-orange-500/10 border-orange-500/30",
                                  repetition: "text-slate-600 bg-slate-500/10 border-slate-500/30",
                                  ocr: "text-red-600 bg-red-500/10 border-red-500/30",
                                };
                                return (
                                  <div key={type} className={`rounded-lg border p-2.5 text-center ${colors[type] || ""}`}>
                                    <p className="text-xl font-bold font-mono">{count}</p>
                                    <p className="text-[10px] uppercase tracking-wider font-bold">{type}</p>
                                  </div>
                                );
                              })
                              .filter(Boolean)}
                          </div>

                          {/* Individual Issues */}
                          <div className="grid gap-2.5">
                            {grammarIssues.map((issue, idx) => {
                              const typeBadgeColor: Record<string, string> = {
                                spelling: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
                                grammar: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
                                punctuation: "bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30",
                                phrasing: "bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30",
                                capitalization: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
                                repetition: "bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30",
                                ocr: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
                              };
                              const sevColor =
                                issue.severity === "critical"
                                  ? "border-l-rose-500"
                                  : issue.severity === "major"
                                    ? "border-l-amber-500"
                                    : "border-l-sky-400";
                              return (
                                <div
                                  key={idx}
                                  className={`rounded-xl border border-border bg-card p-3.5 space-y-2 border-l-4 ${sevColor} transition-all hover:shadow-xs`}
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0 rounded-md ${typeBadgeColor[issue.type] || ""}`}>
                                      {issue.type}
                                    </Badge>
                                    <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0 rounded-md ${
                                      issue.severity === "critical" ? "bg-rose-500/20 text-rose-600 border-rose-500/40" :
                                      issue.severity === "major" ? "bg-amber-500/20 text-amber-600 border-amber-500/40" :
                                      "bg-muted text-muted-foreground border-border"
                                    }`}>
                                      {issue.severity}
                                    </Badge>
                                    {issue.line && (
                                      <span className="text-[10px] font-mono text-muted-foreground">Line {issue.line}</span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-mono bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded border border-rose-500/20 line-through">
                                      {issue.error}
                                    </span>
                                    <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                                    <span className="font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                                      {issue.fix}
                                    </span>
                                  </div>

                                  <p className="text-[11px] text-muted-foreground">
                                    {issue.explanation}
                                  </p>

                                  {issue.context && (
                                    <div className="bg-background/80 p-2 rounded-lg border border-border/60 text-[11px] font-mono text-muted-foreground">
                                      {issue.context}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {/* GenAI Grammar Audit Issues */}
                      {genAiGrammarList.length > 0 && (
                        <div className="space-y-2.5">
                          {grammarIssues.length > 0 && (
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-1">
                              Additional Language &amp; Phrasing Notes ({genAiGrammarList.length})
                            </h4>
                          )}
                          <div className="grid gap-2.5">
                            {genAiGrammarList.map((err, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl border border-border bg-card p-3.5 space-y-2 border-l-4 border-l-amber-500 transition-all hover:shadow-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider px-2 py-0 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                    Language &amp; Phrasing Issue
                                  </Badge>
                                </div>
                                <p className="text-xs text-foreground font-medium">{err}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-2">
                      <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
                      <h4 className="text-sm font-bold text-foreground">Zero Spelling & Grammar Issues</h4>
                      <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        This resume has clean, professional language with no detectable spelling mistakes, grammar errors, or punctuation issues. Ready for Tier-1 company submissions (Microsoft, Amazon, Google, Stripe).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 3: SKILLS & JD MATCHING */}
              {activeNav === "skills" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Layers className="size-4 text-primary" />
                        Skills Matrix &amp; Role Keyword Matching
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Verified skills matched in the candidate's resume vs missing role requirements.
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
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                        Verified Skills Found ({a.skillMatrix.matched.length})
                      </h4>
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
                      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <XCircle className="size-3.5 text-rose-500" />
                        Missing Critical Skills ({a.skillMatrix.missing.length})
                      </h4>
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

                  {/* Priority Tech Stack to Learn */}
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
                </div>
              )}

              {/* SECTION 4: ACTIONABLE FIXES & BULLET REWRITES */}
              {activeNav === "rewrites" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="size-4 text-emerald-500" />
                        Actionable Bullet Rewrites &amp; Roadmap
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        High-impact bullet point upgrades with quantifiable business outcomes and modern tooling.
                      </p>
                    </div>
                  </div>

                  {/* Bullet Rewrites */}
                  <div className="space-y-3.5">
                    {a.bulletRewrites.length > 0 ? (
                      a.bulletRewrites.map((rw, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs"
                        >
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                              Original Bullet (Weak / Unquantified)
                            </span>
                            <div className="p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/20 text-xs text-foreground/80 line-through opacity-80">
                              {rw.original}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1">
                                <Sparkles className="size-3 text-emerald-500" />
                                Recommended ATS Rewrite
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
                              💡 {rw.reason}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-6 rounded-xl border border-border bg-secondary/20 text-xs text-muted-foreground text-center">
                        Current bullet points have solid action verb and quantification depth.
                      </div>
                    )}
                  </div>

                  {/* Step-by-Step Section Fixes */}
                  {a.sectionImprovements && a.sectionImprovements.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-primary" />
                        Step-by-Step Section Fixes ({a.sectionImprovements.length})
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

                  {/* Placement Prep Tips */}
                  {a.placementTips && a.placementTips.length > 0 && (
                    <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <Lightbulb className="size-3.5 text-amber-500" />
                        Placement Round &amp; Interview Tips
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
                </div>
              )}

              {/* SECTION 5: PROJECT & ARCHITECTURE */}
              {activeNav === "projects" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Cpu className="size-4 text-primary" />
                        Project Complexity &amp; Architecture Review
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Technical depth, live repository proof, schema design, and engineering rigor.
                      </p>
                    </div>
                    {sec?.projects && (
                      <Badge variant="outline" className="text-xs font-mono font-bold text-primary bg-primary/10">
                        {sec.projects.score} / {sec.projects.max} pts
                      </Badge>
                    )}
                  </div>

                  {sec?.projects ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Architecture Rating: <strong className="text-foreground">{sec.projects.architectureRating}</strong>
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              sec.projects.liveProof
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                            }
                          >
                            {sec.projects.liveProof ? "✓ Live Repository Proof" : "⚠️ No Live Repo Links"}
                          </Badge>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed bg-secondary/30 p-3.5 rounded-lg border border-border/60">
                          {sec.projects.audit}
                        </p>
                        {sec.projects.fixTip && (
                          <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg flex items-start gap-2">
                            <Sparkles className="size-4 shrink-0 mt-0.5" />
                            <span>
                              <strong className="text-foreground">Architecture Polish: </strong>
                              {sec.projects.fixTip}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Recommended Project Ideas */}
                      {a.projectSuggestions && a.projectSuggestions.length > 0 && (
                        <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                            <Code2 className="size-3.5 text-primary" />
                            Recommended Engineering Projects to Build
                          </h4>
                          <ul className="space-y-2">
                            {a.projectSuggestions.map((proj, i) => (
                              <li key={i} className="text-xs text-foreground bg-background/80 p-3 rounded-lg border border-border/60 flex items-start gap-2">
                                <span className="text-primary font-bold">•</span>
                                <span>{proj}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Standard project audit metrics satisfied.</p>
                  )}
                </div>
              )}

              {/* SECTION 6: TECHNICAL ATS SCAN */}
              {activeNav === "ats" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Zap className="size-4 text-amber-500" />
                        ATS Technical Scan &amp; Document Scannability
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Deterministic checks calculated directly from resume text.
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
                              className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-background/80 border border-border/60"
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
                </div>
              )}
            </div>

            {/* Officer Action & Notes Footer */}
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
          </main>
        </div>
      </SheetContent>
    </Sheet>
  );
}
