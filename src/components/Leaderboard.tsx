import { useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TIER_ORDER,
  effectiveScore,
  tierTone,
  SCORE_CATEGORIES,
  getScoreCategory,
  type Analysis,
  type ScoreCategoryId,
} from "@/lib/analysis-types";

export type LeaderRow = {
  id: string;
  fileName: string;
  analysis: Analysis;
};

type SortKey = "rank" | "name" | "score" | "tier" | "jd" | "issues" | "structure";

const tierShort = (tier: string) => tier.replace(/^Tier \d: /, "");

function rankMedal(rank: number) {
  if (rank === 1) return "text-amber-500";
  if (rank === 2) return "text-slate-400";
  if (rank === 3) return "text-amber-700";
  return "text-muted-foreground";
}

export function Leaderboard({
  rows,
  onOpen,
  onExportCsvSelected,
  onExportMdSelected,
  onDelete,
  onDeleteMany,
  onReevaluate,
  onReevaluateMany,
  hasActiveJd,
  shortlistCutoff = 75,
  onShortlistCutoffChange,
}: {
  rows: LeaderRow[];
  onOpen: (id: string) => void;
  onExportCsvSelected?: ((rows: LeaderRow[]) => void) | undefined;
  onExportMdSelected?: ((rows: LeaderRow[]) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  onDeleteMany?: ((ids: string[]) => void) | undefined;
  onReevaluate?: ((id: string) => void) | undefined;
  onReevaluateMany?: ((ids: string[]) => void) | undefined;
  hasActiveJd?: boolean | undefined;
  shortlistCutoff?: number | undefined;
  onShortlistCutoffChange?: ((val: number) => void) | undefined;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreCategoryId>("all");
  const [onlyShortlisted, setOnlyShortlisted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const cutoff = shortlistCutoff ?? 75;

  // Deduplicate rows by file name so each candidate/resume only ever has one entry in leaderboard
  const uniqueRows = useMemo(() => {
    const map = new Map<string, LeaderRow>();
    for (const r of rows) {
      if (!r || !r.analysis) continue;
      const key = (r.fileName || r.id || "").trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, r);
      } else {
        // Keep the more complete or higher scored one if duplicate exists
        if (effectiveScore(r.analysis) >= effectiveScore(existing.analysis)) {
          map.set(key, r);
        }
      }
    }
    return Array.from(map.values());
  }, [rows]);

  const shortlistedCount = useMemo(() => {
    return uniqueRows.filter((r) => {
      const a = r.analysis;
      const score = effectiveScore(a);
      const isOverhaul = a.readinessTier.startsWith("Tier 3");
      const critCount =
        (a.criticalIssues || []).filter((i) => i.severity === "critical").length +
        (a.ats?.blockers || []).length;
      return score >= cutoff && !isOverhaul && critCount === 0;
    }).length;
  }, [uniqueRows, cutoff]);

  const tierCounts = useMemo(
    () => ({
      all: uniqueRows.length,
      "Tier 1": uniqueRows.filter((r) => r.analysis.readinessTier.startsWith("Tier 1")).length,
      "Tier 2": uniqueRows.filter((r) => r.analysis.readinessTier.startsWith("Tier 2")).length,
      "Tier 3": uniqueRows.filter((r) => r.analysis.readinessTier.startsWith("Tier 3")).length,
    }),
    [uniqueRows],
  );

  const scoreCounts = useMemo(() => {
    const counts: Record<string, number> = { all: uniqueRows.length };
    for (const cat of SCORE_CATEGORIES) {
      if (cat.id === "all") continue;
      counts[cat.id] = uniqueRows.filter((r) => {
        const score = effectiveScore(r.analysis);
        return score >= cat.min && score <= cat.max;
      }).length;
    }
    return counts;
  }, [uniqueRows]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = uniqueRows.filter((r) => {
      if (!r || !r.analysis) return false;
      const score = effectiveScore(r.analysis);

      const critCount =
        (r.analysis.criticalIssues || []).filter((i) => i.severity === "critical").length +
        (r.analysis.ats?.blockers || []).length;
      const isOverhaul = (r.analysis.readinessTier || "").startsWith("Tier 3");
      const isCandidateShortlisted = score >= cutoff && !isOverhaul && critCount === 0;

      if (onlyShortlisted && !isCandidateShortlisted) return false;

      const tier = r.analysis.readinessTier || "";
      if (tierFilter !== "all" && !tier.startsWith(tierFilter)) return false;

      if (scoreFilter !== "all") {
        const cat = SCORE_CATEGORIES.find((c) => c.id === scoreFilter);
        if (cat) {
          if (score < cat.min || score > cat.max) return false;
        }
      }

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
        (a.analysis.candidateName || "").localeCompare(a.analysis.candidateName || ""),
      tier: (a, b) =>
        (TIER_ORDER[a.analysis.readinessTier] ?? 99) - (TIER_ORDER[b.analysis.readinessTier] ?? 99),
      jd: (a, b) => {
        const scoreA = typeof a.analysis.jdScore === "number" ? a.analysis.jdScore : Math.round(effectiveScore(a.analysis) * 0.88);
        const scoreB = typeof b.analysis.jdScore === "number" ? b.analysis.jdScore : Math.round(effectiveScore(b.analysis) * 0.88);
        return scoreA - scoreB;
      },
      issues: (a, b) =>
        ((a.analysis.criticalIssues || []).length +
          (a.analysis.criticalIssues || []).filter((i) => i.severity === "critical").length * 5) -
        ((b.analysis.criticalIssues || []).length +
          (b.analysis.criticalIssues || []).filter((i) => i.severity === "critical").length * 5),
      structure: (a, b) => (a.analysis.structure?.score ?? 0) - (b.analysis.structure?.score ?? 0),
    };
    list = [...list].sort((a, b) => cmp[sortKey](a, b) * dir);
    return list;
  }, [uniqueRows, sortKey, asc, query, tierFilter, scoreFilter, onlyShortlisted, cutoff]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "name");
    }
  };

  const allFilteredSelected =
    sorted.length > 0 && sorted.every((row) => selectedIds.has(row.id));
  const someFilteredSelected =
    sorted.some((row) => selectedIds.has(row.id)) && !allFilteredSelected;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedRows = useMemo(() => {
    return rows.filter((r) => selectedIds.has(r.id));
  }, [rows, selectedIds]);

  const handleExportCsvSelected = () => {
    if (selectedRows.length === 0) return;
    onExportCsvSelected?.(selectedRows);
  };

  const handleExportMdSelected = () => {
    if (selectedRows.length === 0) return;
    onExportMdSelected?.(selectedRows);
  };

  const handleDeleteSelected = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (confirm(`Are you sure you want to delete ${count} selected candidate${count > 1 ? "s" : ""}?`)) {
      onDeleteMany?.(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleReevaluateSelected = () => {
    if (selectedIds.size === 0) return;
    onReevaluateMany?.(Array.from(selectedIds));
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Score Range Category Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">
              Score Range:
            </span>
            <Select
              value={scoreFilter}
              onValueChange={(v) => setScoreFilter(v as ScoreCategoryId)}
            >
              <SelectTrigger className="h-8 min-w-[170px] text-xs font-medium rounded-lg bg-secondary/40 border-border">
                <SelectValue placeholder="Score Category" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {SCORE_CATEGORIES.map((cat) => {
                  const count = scoreCounts[cat.id] ?? 0;
                  return (
                    <SelectItem key={cat.id} value={cat.id} className="text-xs py-1.5">
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="font-medium">{cat.label}</span>
                        <span className="ml-auto rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {count}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
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
      </div>

      {/* Shortlist % Cutoff Controller Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Target className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold text-foreground">Shortlist Threshold:</span>
            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              ≥ {cutoff}%
            </span>
          </div>

          {/* Quick Cutoff Preset Buttons */}
          <div className="flex items-center gap-1">
            {[60, 70, 75, 80, 85, 90].map((p) => (
              <Button
                key={p}
                size="sm"
                variant={cutoff === p ? "default" : "outline"}
                className={`h-6 px-2 text-[11px] font-semibold rounded-md ${
                  cutoff === p
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"
                    : "bg-card/80 text-muted-foreground hover:text-foreground border-border/80"
                }`}
                onClick={() => onShortlistCutoffChange?.(p)}
              >
                {p}%
              </Button>
            ))}
          </div>

          {onShortlistCutoffChange && (
            <div className="w-28 hidden sm:block">
              <Slider
                value={[cutoff]}
                min={40}
                max={95}
                step={5}
                onValueChange={([v]) => onShortlistCutoffChange(v ?? 75)}
              />
            </div>
          )}
        </div>

        {/* Shortlist Filter Toggle & Live Counter */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={onlyShortlisted ? "default" : "outline"}
            className={`h-7 text-xs font-bold rounded-lg transition-all ${
              onlyShortlisted
                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                : "bg-card hover:bg-secondary text-foreground border-emerald-500/40"
            }`}
            onClick={() => setOnlyShortlisted((prev) => !prev)}
          >
            <CheckCircle2 className="size-3.5 mr-1 text-emerald-400" />
            {onlyShortlisted ? "Showing Shortlisted" : "Filter Shortlisted Only"} ({shortlistedCount} / {rows.length})
          </Button>
        </div>
      </div>

      {scoreFilter !== "all" && (
        <div className="flex items-center gap-2 px-1 text-xs">
          <span className="text-muted-foreground">Filtered by:</span>
          {(() => {
            const currentCat = SCORE_CATEGORIES.find((c) => c.id === scoreFilter);
            if (!currentCat) return null;
            return (
              <Badge
                variant="outline"
                className={`text-xs font-medium px-2 py-0.5 gap-1 ${currentCat.badgeBg} ${currentCat.badgeText} ${currentCat.badgeBorder}`}
              >
                {currentCat.label} ({scoreCounts[currentCat.id] ?? 0})
                <button
                  type="button"
                  onClick={() => setScoreFilter("all")}
                  className="hover:opacity-75 ml-0.5 inline-flex"
                  aria-label="Remove score filter"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })()}
        </div>
      )}

      {/* Floating / Inline Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-primary">
              {selectedIds.size}
            </span>
            <span className="text-xs font-medium text-foreground">
              candidate{selectedIds.size > 1 ? "s" : ""} selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onExportCsvSelected && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                onClick={handleExportCsvSelected}
              >
                <FileSpreadsheet className="size-3 mr-1.5" />
                Export CSV ({selectedIds.size})
              </Button>
            )}

            {onExportMdSelected && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs font-semibold rounded-lg bg-card hover:bg-secondary border-border text-foreground"
                onClick={handleExportMdSelected}
              >
                <Download className="size-3 mr-1.5 text-primary" />
                Export MD ({selectedIds.size})
              </Button>
            )}

            {onReevaluateMany && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs font-semibold rounded-lg bg-card hover:bg-secondary border-primary/40 text-foreground"
                onClick={handleReevaluateSelected}
              >
                <RefreshCw className="size-3 mr-1.5 text-primary" />
                Re-evaluate {hasActiveJd ? "with Current JD" : "Selected"} ({selectedIds.size})
              </Button>
            )}

            {onDeleteMany && (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs font-semibold rounded-lg"
                onClick={handleDeleteSelected}
              >
                <Trash2 className="size-3 mr-1.5" />
                Delete Selected ({selectedIds.size})
              </Button>
            )}

            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedIds(new Set())}
              title="Clear selection"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="panel overflow-hidden border border-border/80 rounded-2xl shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/30">
              <TableRow className="border-b border-border/80 hover:bg-transparent">
                <TableHead className="w-12 px-3 text-center">
                  <div className="flex items-center justify-center">
                    <Checkbox
                      checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all candidates"
                    />
                  </div>
                </TableHead>
                <TableHead className="w-12 text-center text-xs font-semibold text-muted-foreground">
                  #
                </TableHead>
                <Th k="name" className="min-w-[180px]">Candidate &amp; Target Role</Th>
                <Th k="score" className="w-24 text-center">
                  Score
                </Th>
                <Th k="tier" className="w-36">
                  Readiness / Status
                </Th>
                <Th k="structure" className="w-24 text-center">
                  Structure
                </Th>
                <Th k="jd" className="w-24 text-center">
                  Fit / Match
                </Th>
                <Th k="issues" className="w-24">
                  Issues
                </Th>
                <TableHead className="w-28 text-right text-xs font-semibold text-muted-foreground pr-4">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/60">
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-12 text-center text-xs text-muted-foreground"
                  >
                    No resumes match this filter.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((row, index) => {
                const a = row.analysis;
                const score = effectiveScore(a);
                const isSelected = selectedIds.has(row.id);
                const critIssuesCount = (a.criticalIssues || []).length;
                const formattingCount = (a.formattingProblems || []).length;
                const grammarCount = (a.grammarAndOcrErrors || []).length;
                const totalIssues = critIssuesCount + formattingCount + grammarCount;
                const critical =
                  (a.criticalIssues || []).filter((i) => i.severity === "critical").length +
                  (a.ats?.blockers || []).length;
                const isShortlisted =
                  score >= cutoff && !a.readinessTier.startsWith("Tier 3") && critical === 0;
                return (
                  <TableRow
                    key={row.id}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? "bg-primary/10 hover:bg-primary/15"
                        : isShortlisted
                        ? "border-l-4 border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 hover:bg-emerald-500/15"
                        : "hover:bg-secondary/50"
                    }`}
                    onClick={() => onOpen(row.id)}
                  >
                    <TableCell
                      className="w-12 px-3 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectRow(row.id);
                      }}
                    >
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(row.id);
                              else next.delete(row.id);
                              return next;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select candidate ${a.candidateName}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="w-12 text-center">
                      <div className="flex items-center justify-center gap-1.5">
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
                      <div className="flex items-center gap-1.5">
                        <p className="max-w-[16rem] truncate text-xs font-semibold text-foreground">
                          {a.candidateName}
                        </p>
                        {isShortlisted && (
                          <span
                            className="inline-flex items-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20"
                            title={`Score ${score}% meets threshold ${cutoff}%`}
                          >
                            🎯 Shortlist
                          </span>
                        )}
                      </div>
                      <p className="max-w-[16rem] truncate text-xs text-muted-foreground mt-0.5">
                        {a.role}
                        <span className="opacity-60">
                          {" "}
                          · judged vs {a.assumedRole || "—"} · {row.fileName}
                        </span>
                      </p>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const cat = getScoreCategory(score);
                        return (
                          <span
                            className={`inline-flex items-center justify-center rounded-md px-2.5 py-0.5 font-mono text-xs font-bold border transition-colors ${
                              isShortlisted
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 shadow-xs"
                                : `${cat.badgeBg} ${cat.badgeText} ${cat.badgeBorder}`
                            }`}
                            title={`${cat.label} — ${cat.description}`}
                          >
                            {score}
                          </span>
                        );
                      })()}
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
                    <TableCell className="text-xs font-medium text-center">
                      {(() => {
                        const isJd = a.evaluationBasis === "jd-fit";
                        const jdVal =
                          typeof a.jdScore === "number"
                            ? a.jdScore
                            : Math.max(0, Math.min(100, Math.round(score * 0.88)));
                        return (
                          <div className="flex flex-col items-center">
                            <span className="text-foreground font-semibold font-mono">{jdVal}%</span>
                            <span className="text-[10px] text-muted-foreground">
                              {isJd ? "Custom JD" : "Global SDE"}
                            </span>
                          </div>
                        );
                      })()}
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
