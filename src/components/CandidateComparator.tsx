import React from "react";
import { effectiveScore, type Analysis, type Issue } from "@/lib/analysis-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Sparkles, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";

export interface CandidateCompareItem {
  id: string;
  fileName: string;
  analysis: Analysis;
}

interface CandidateComparatorProps {
  candidates: CandidateCompareItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCandidate?: (id: string) => void;
}

export function CandidateComparator({
  candidates,
  open,
  onOpenChange,
  onSelectCandidate,
}: CandidateComparatorProps) {
  if (candidates.length < 2) return null;

  // Find leader by score
  const sorted = [...candidates].sort((a, b) => effectiveScore(b.analysis) - effectiveScore(a.analysis));
  const highestScore = effectiveScore(sorted[0].analysis);

  // Compute common and unique skills
  const allCandidateSkills = candidates.map((c) => new Set(c.analysis.skillMatrix?.matched || []));
  const commonSkills: string[] = allCandidateSkills.length > 0 && allCandidateSkills[0].size > 0
    ? [...allCandidateSkills[0]].filter((skill) =>
        allCandidateSkills.every((set) => set.has(skill)),
      )
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-6 bg-background/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl">
        <DialogHeader className="mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Head-to-Head Candidate Comparison
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Comparing {candidates.length} candidates across ATS scores, skill coverage, and project depth.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Matrix Grid */}
        <div
          className={`grid gap-4 ${
            candidates.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"
          }`}
        >
          {candidates.map((c) => {
            const currentScore = effectiveScore(c.analysis);
            const isLeader = currentScore === highestScore;
            const criticalCount = (c.analysis.criticalIssues || []).filter((i: Issue) => i.severity === "critical").length;
            const matchedSkills = c.analysis.skillMatrix?.matched || [];
            const missingSkills = c.analysis.skillMatrix?.missing || [];

            return (
              <div
                key={c.id}
                className={`relative flex flex-col rounded-xl border p-5 transition-all ${
                  isLeader
                    ? "border-primary/50 bg-primary/5 shadow-md ring-1 ring-primary/20"
                    : "border-border bg-card/60"
                }`}
              >
                {isLeader && (
                  <div className="absolute -top-3 right-4 bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                    <Sparkles className="w-3 h-3" /> Top Rank
                  </div>
                )}

                {/* Header Profile */}
                <div className="mb-4">
                  <h3 className="font-bold text-lg text-foreground truncate">{c.analysis.candidateName}</h3>
                  <p className="text-xs text-muted-foreground truncate">{c.fileName}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        c.analysis.readinessTier === "Tier 1: Shortlist Ready"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : c.analysis.readinessTier === "Tier 2: Needs Minor Polish"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                      }
                    >
                      {c.analysis.readinessTier.split(":")[1]?.trim() || c.analysis.readinessTier}
                    </Badge>
                  </div>
                </div>

                {/* Score Gauge */}
                <div className="p-3 mb-4 rounded-lg bg-background/80 border border-border/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Overall ATS Score</span>
                    <div className="text-2xl font-black text-foreground">{currentScore}/100</div>
                  </div>
                  {c.analysis.jdScore !== null && (
                    <div className="text-right">
                      <span className="text-xs font-medium text-muted-foreground">JD Fit Match</span>
                      <div className="text-lg font-bold text-primary">{c.analysis.jdScore}%</div>
                    </div>
                  )}
                </div>

                {/* Category Breakdown */}
                <div className="space-y-2 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Score Breakdown
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {(c.analysis.scoreBreakdown || []).map((b) => (
                      <div key={b.category} className="flex justify-between items-center">
                        <span className="text-muted-foreground truncate">{b.category}</span>
                        <span className="font-semibold text-foreground">
                          {b.score}/{b.max}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Matched Skills */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Matched Skills ({matchedSkills.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {matchedSkills.slice(0, 10).map((s: string) => (
                      <Badge key={s} variant="secondary" className="text-[10px] py-0">
                        {s}
                      </Badge>
                    ))}
                    {matchedSkills.length > 10 && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        +{matchedSkills.length - 10} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Missing Skills */}
                {missingSkills.length > 0 && (
                  <div className="mb-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-rose-500/90 mb-1.5 block">
                      Missing Gaps ({missingSkills.length})
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {missingSkills.slice(0, 6).map((s: string) => (
                        <span
                          key={s}
                          className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Critical Issues Check */}
                <div className="mt-auto pt-3 border-t border-border flex items-center justify-between text-xs">
                  {criticalCount === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> 0 Critical Issues
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {criticalCount} Critical Issue(s)
                    </span>
                  )}
                  {onSelectCandidate && (
                    <button
                      onClick={() => {
                        onSelectCandidate(c.id);
                        onOpenChange(false);
                      }}
                      className="text-primary hover:underline font-semibold flex items-center gap-0.5"
                    >
                      Inspect <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Common Tech Stack Footer */}
        {commonSkills.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-muted/40 border border-border text-xs flex items-center gap-2">
            <span className="font-semibold text-foreground">Common Skills Across Selected:</span>
            <div className="flex flex-wrap gap-1">
              {commonSkills.map((s) => (
                <Badge key={s} variant="outline" className="text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
