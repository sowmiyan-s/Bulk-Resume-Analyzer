import { useMemo, useState } from "react";
import { Award, ChevronDown, ChevronUp, Filter, RefreshCw, Trash2, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TIER_ORDER, effectiveScore, tierTone, type Analysis } from "@/lib/analysis-types";

export type LeaderRow = {
  id: string;
  fileName: string;
  analysis: Analysis;
};

type SortKey = "rank" | "name" | "score" | "tier" | "jd" | "issues" | "structure";

const tierShort = (tier: string) => tier.replace(/^Tier \d: /, "");

function scoreTone(score: number) {
  if (score >= 75) return "bg-success/15 text-success border-success/30";
  if (score >= 55) return "bg-warning/15 text-warning border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

function rankMedal(rank: number) {
  if (rank === 1) return "text-amber-500";
  if (rank === 2) return "text-slate-400";
  if (rank === 3) return "text-amber-700";
  return "text-muted-foreground";
}

export function Leaderboard({
  rows,
  onOpen,
  onDelete,
  onReevaluate,
  hasActiveJd,
}: {
  rows: LeaderRow[];
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  onReevaluate?: (id: string) => void;
  hasActiveJd?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");

  const tierCounts = useMemo(
    () => ({
      all: rows.length,
      "Tier 1": rows.filter((r) => r.analysis.readinessTier.startsWith("Tier 1")).length,
      "Tier 2": rows.filter((r) => r.analysis.readinessTier.startsWith("Tier 2")).length,
      "Tier 3": rows.filter((r) => r.analysis.readinessTier.startsWith("Tier 3")).length,
    }),
    [rows],
  );

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!r || !r.analysis) return false;
      const tier = r.analysis.readinessTier || "";
      if (tierFilter !== "all" && !tier.startsWith(tierFilter)) return false;
      if (!q) return true;
      const a = r.analysis;
      return (
        (a.candidateName || "").toLowerCase().includes(q) ||
        (a.role || "").toLowerCase().includes(q) ||
        (a.assumedRole ?? "").toLowerCase().includes(q) ||
        (r.fileName || "").toLowerCase().includes(q)
      );
    });

    const dir = asc ? 1 : -1;
    const cmp: Record<SortKey, (a: LeaderRow, b: LeaderRow) => number> = {
      rank: (a, b) => effectiveScore(b.analysis) - effectiveScore(a.analysis),
      score: (a, b) => effectiveScore(a.analysis) - effectiveScore(b.analysis),
      name: (a, b) =>
        (a.analysis.candidateName || "").localeCompare(b.analysis.candidateName || ""),
      tier: (a, b) =>
        (TIER_ORDER[a.analysis.readinessTier] ?? 99) - (TIER_ORDER[b.analysis.readinessTier] ?? 99),
      jd: (a, b) => (a.analysis.jdScore ?? -1) - (b.analysis.jdScore ?? -1),
      issues: (a, b) =>
        ((a.analysis.criticalIssues || []).length +
          (a.analysis.criticalIssues || []).filter((i) => i.severity === "critical").length * 5) -
        ((b.analysis.criticalIssues || []).length +
          (b.analysis.criticalIssues || []).filter((i) => i.severity === "critical").length * 5),
      structure: (a, b) => (a.analysis.structure?.score ?? 0) - (b.analysis.structure?.score ?? 0),
    };
    return [...list].sort((a, b) => cmp[sortKey](a, b) * dir);
  }, [rows, sortKey, asc, query, tierFilter]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "name");
    }
  };

  const Th = ({
    k,
    children,
    className = "",
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggle(k)}
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
        {sortKey === k ? (
          asc ? (
            <ChevronUp className="size-3 text-foreground" />
          ) : (
            <ChevronDown className="size-3 text-foreground" />
          )
        ) : (
          <ChevronDown className="size-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );

  const filterOptions = [
    { id: "all", label: "All", count: tierCounts.all },
    { id: "Tier 1", label: "Shortlist", count: tierCounts["Tier 1"] },
    { id: "Tier 2", label: "Polish", count: tierCounts["Tier 2"] },
    { id: "Tier 3", label: "Overhaul", count: tierCounts["Tier 3"] },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, role, or filename…"
            className="h-9 pl-9 text-xs rounded-lg bg-secondary/40 border-border"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-secondary/40 p-1">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTierFilter(opt.id)}
              className={`h-7 rounded-md px-3 text-xs font-medium transition-all ${
                tierFilter === opt.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
              <span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.2 font-mono text-[10px]">
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/40">
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="w-12 text-xs font-semibold text-muted-foreground">
                  #
                </TableHead>
                <Th k="name">Candidate &amp; Target Role</Th>
                <Th k="score" className="w-24">
                  Score
                </Th>
                <Th k="tier" className="w-32">
                  Readiness
                </Th>
                <Th k="structure" className="w-24">
                  Structure
                </Th>
                <Th k="jd" className="w-20">
                  JD Fit
                </Th>
                <Th k="issues" className="w-24">
                  Critical
                </Th>
                <TableHead className="w-28 text-right text-xs font-semibold text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-xs text-muted-foreground"
                  >
                    No resumes match this filter.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((row, index) => {
                const a = row.analysis;
                const score = effectiveScore(a);
                const totalIssues = (a.criticalIssues || []).length;
                const critical = (a.criticalIssues || []).filter((i) => i.severity === "critical").length;
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-secondary/50"
                    onClick={() => onOpen(row.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {index < 3 ? (
                          <Trophy className={`size-4 ${rankMedal(index + 1)}`} />
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {index + 1}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[16rem] truncate text-xs font-semibold text-foreground">
                        {a.candidateName}
                      </p>
                      <p className="max-w-[16rem] truncate text-xs text-muted-foreground mt-0.5">
                        {a.role}
                        <span className="opacity-60">
                          {" "}
                          · judged vs {a.assumedRole || "—"} · {row.fileName}
                        </span>
                      </p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center justify-center rounded-md px-2.5 py-0.5 font-mono text-xs font-bold border ${scoreTone(
                          score,
                        )}`}
                      >
                        {score}
                      </span>
                      {a.manualScore !== null && (
                        <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                          edited
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`whitespace-nowrap text-xs font-medium rounded-md ${tierTone(
                          a.readinessTier,
                        )}`}
                      >
                        {tierShort(a.readinessTier)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.structure?.score ? (
                        <span className="font-medium text-foreground">{a.structure.score}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {a.jdScore !== null ? (
                        <span className="text-foreground font-semibold">{a.jdScore}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={
                          critical > 0
                            ? "font-semibold text-destructive"
                            : totalIssues > 0
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                        }
                      >
                        {totalIssues === 0
                          ? "0"
                          : critical > 0
                            ? `${totalIssues} (${critical} crit)`
                            : `${totalIssues}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex justify-end items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs rounded-lg px-2.5 hover:bg-secondary"
                          onClick={() => onOpen(row.id)}
                        >
                          Review
                        </Button>
                        {onReevaluate && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={() => onReevaluate(row.id)}
                            title={hasActiveJd ? "Re-evaluate with Current JD" : "Re-evaluate candidate"}
                            aria-label="Re-evaluate candidate"
                          >
                            <RefreshCw className="size-3.5" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm(`Delete candidate "${a.candidateName}"?`)) {
                                onDelete(row.id);
                              }
                            }}
                            title="Delete candidate record"
                            aria-label="Delete candidate record"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Award className="size-3.5" />
        Ranked by final score (officer overrides included). Click any row to open the full audit.
      </p>
    </div>
  );
}
