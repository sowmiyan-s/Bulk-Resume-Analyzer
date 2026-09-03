import React from "react";
import { effectiveScore, type Analysis } from "@/lib/analysis-types";
import { Badge } from "@/components/ui/badge";
import { Users, Award, AlertCircle, CheckCircle2 } from "lucide-react";

interface BatchAnalyticsProps {
  analyses: Array<{ id: string; analysis: Analysis }>;
}

export function BatchAnalytics({ analyses }: BatchAnalyticsProps) {
  if (!analyses || analyses.length === 0) return null;

  const total = analyses.length;
  const scores = analyses.map((a) => effectiveScore(a.analysis));
  const avgScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / total);
  const highestScore = Math.max(...scores);

  const tier1Count = analyses.filter(
    (a) => a.analysis.readinessTier === "Tier 1: Shortlist Ready",
  ).length;
  const tier2Count = analyses.filter(
    (a) => a.analysis.readinessTier === "Tier 2: Needs Minor Polish",
  ).length;
  const tier3Count = analyses.filter(
    (a) => a.analysis.readinessTier === "Tier 3: Overhaul Required",
  ).length;

  const tier1Pct = Math.round((tier1Count / total) * 100);
  const tier2Pct = Math.round((tier2Count / total) * 100);
  const tier3Pct = Math.round((tier3Count / total) * 100);

  // Skill frequencies
  const matchedSkillFreq = new Map<string, number>();
  const missingSkillFreq = new Map<string, number>();

  for (const a of analyses) {
    const matched = a.analysis.skillMatrix?.matched || [];
    const missing = a.analysis.skillMatrix?.missing || [];
    for (const skill of matched) {
      matchedSkillFreq.set(skill, (matchedSkillFreq.get(skill) ?? 0) + 1);
    }
    for (const skill of missing) {
      missingSkillFreq.set(skill, (missingSkillFreq.get(skill) ?? 0) + 1);
    }
  }

  const topSkills = Array.from(matchedSkillFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const topGaps = Array.from(missingSkillFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="space-y-4 mb-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card/60 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Batch Size</div>
            <div className="text-xl font-bold text-foreground">{total} Resumes</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card/60 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Average Score</div>
            <div className="text-xl font-bold text-foreground">
              {avgScore}/100 <span className="text-xs font-normal text-muted-foreground">({highestScore} max)</span>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card/60 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Shortlist Ready</div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {tier1Count} <span className="text-xs font-normal text-muted-foreground">({tier1Pct}%)</span>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card/60 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Overhaul Needed</div>
            <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
              {tier3Count} <span className="text-xs font-normal text-muted-foreground">({tier3Pct}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Distribution & Skill Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tier Distribution Bar */}
        <div className="p-4 rounded-xl border border-border bg-card/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Readiness Distribution
              </span>
            </div>
            <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted mb-3">
              <div
                style={{ width: `${tier1Pct}%` }}
                className="bg-emerald-500 transition-all"
                title={`Tier 1: ${tier1Count} (${tier1Pct}%)`}
              />
              <div
                style={{ width: `${tier2Pct}%` }}
                className="bg-amber-500 transition-all"
                title={`Tier 2: ${tier2Count} (${tier2Pct}%)`}
              />
              <div
                style={{ width: `${tier3Pct}%` }}
                className="bg-rose-500 transition-all"
                title={`Tier 3: ${tier3Count} (${tier3Pct}%)`}
              />
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Shortlist Ready
                </span>
                <span className="font-semibold">{tier1Count} ({tier1Pct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Minor Polish
                </span>
                <span className="font-semibold">{tier2Count} ({tier2Pct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Overhaul Required
                </span>
                <span className="font-semibold">{tier3Count} ({tier3Pct}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Prevalent Skills */}
        <div className="p-4 rounded-xl border border-border bg-card/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Top Matched Skills in Pool
            </span>
          </div>
          {topSkills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {topSkills.map(([skill, count]) => {
                const pct = Math.round((count / total) * 100);
                return (
                  <Badge key={skill} variant="secondary" className="text-xs py-0.5 px-2">
                    {skill} <span className="ml-1 text-[10px] text-muted-foreground font-bold">{pct}%</span>
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No technical skills detected yet.</p>
          )}
        </div>

        {/* Common Skill Gaps */}
        <div className="p-4 rounded-xl border border-border bg-card/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-500/90">
              Common JD Gaps Across Batch
            </span>
          </div>
          {topGaps.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {topGaps.map(([gap, count]) => {
                const pct = Math.round((count / total) * 100);
                return (
                  <span
                    key={gap}
                    className="inline-flex items-center text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  >
                    {gap} <span className="ml-1 text-[10px] opacity-75 font-semibold">({pct}%)</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No major skill gaps identified across batch.</p>
          )}
        </div>
      </div>
    </div>
  );
}
