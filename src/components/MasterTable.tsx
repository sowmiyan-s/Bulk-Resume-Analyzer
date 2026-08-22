import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, FileDown, Search } from "lucide-react";

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

export type MasterRow = {
  id: string;
  fileName: string;
  analysis: Analysis;
};

type SortKey = "rank" | "name" | "score" | "tier" | "jd" | "issues" | "missing" | "file";

export function MasterTable({
  rows,
  onOpen,
  onExportPdf,
}: {
  rows: MasterRow[];
  onOpen: (id: string) => void;
  onExportPdf: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");

  const tierCounts = useMemo(() => {
    return {
      all: rows.length,
      "Tier 1": rows.filter((r) => r.analysis.readinessTier.startsWith("Tier 1")).length,
      "Tier 2": rows.filter((r) => r.analysis.readinessTier.startsWith("Tier 2")).length,
      "Tier 3": rows.filter((r) => r.analysis.readinessTier.startsWith("Tier 3")).length,
    };
  }, [rows]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (!r || !r.analysis) return false;
      const tier = r.analysis.readinessTier || "";
      if (tierFilter !== "all" && !tier.startsWith(tierFilter)) return false;
      if (!q) return true;
      const a = r.analysis;
      return (
        (a.candidateName || "").toLowerCase().includes(q) ||
        (a.role || "").toLowerCase().includes(q) ||
        (r.fileName || "").toLowerCase().includes(q) ||
        (a.skillMatrix?.matched || []).join(" ").toLowerCase().includes(q) ||
        (a.skillMatrix?.missing || []).join(" ").toLowerCase().includes(q)
      );
    });

    const dir = asc ? 1 : -1;
    const cmp: Record<SortKey, (a: MasterRow, b: MasterRow) => number> = {
      rank: (a, b) => effectiveScore(b.analysis) - effectiveScore(a.analysis),
      score: (a, b) => effectiveScore(a.analysis) - effectiveScore(b.analysis),
      name: (a, b) =>
        (a.analysis.candidateName || "").localeCompare(b.analysis.candidateName || ""),
      file: (a, b) => (a.fileName || "").localeCompare(b.fileName || ""),
      tier: (a, b) =>
        (TIER_ORDER[a.analysis.readinessTier] ?? 99) - (TIER_ORDER[b.analysis.readinessTier] ?? 99),
      jd: (a, b) => (a.analysis.jdScore ?? -1) - (b.analysis.jdScore ?? -1),
      issues: (a, b) =>
        (a.analysis.criticalIssues || []).filter((i) => i.severity === "critical").length -
        (b.analysis.criticalIssues || []).filter((i) => i.severity === "critical").length,
      missing: (a, b) =>
        (a.analysis.skillMatrix?.missing || []).length -
        (b.analysis.skillMatrix?.missing || []).length,
    };

    list = [...list].sort((a, b) => cmp[sortKey](a, b) * dir);
    return list;
  }, [rows, sortKey, asc, query, tierFilter]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "name" || key === "file" || key === "tier");
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
            <ArrowUp className="size-3 text-foreground" />
          ) : (
            <ArrowDown className="size-3 text-foreground" />
          )
        ) : (
          <ChevronsUpDown className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  const filterOptions = [
    { id: "all", label: "All Applicants", count: tierCounts.all },
    { id: "Tier 1", label: "Shortlisted", count: tierCounts["Tier 1"] },
    { id: "Tier 2", label: "Needs Polish", count: tierCounts["Tier 2"] },
    { id: "Tier 3", label: "Needs Overhaul", count: tierCounts["Tier 3"] },
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates, skills, role, or filename..."
            className="h-9 pl-9 text-xs rounded-xl bg-secondary/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-secondary/30 p-1 rounded-xl border border-border/80">
          {filterOptions.map((opt) => (
            <Button
              key={opt.id}
              size="sm"
              variant={tierFilter === opt.id ? "secondary" : "ghost"}
              className={`h-7 px-3 text-xs font-medium rounded-lg transition-all ${
                tierFilter === opt.id
                  ? "bg-card text-foreground font-semibold shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTierFilter(opt.id)}
            >
              {opt.label}
              <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                {opt.count}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <div className="panel overflow-hidden border border-border/80">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/20">
              <TableRow className="border-b border-border/80 hover:bg-transparent">
                <TableHead className="w-12 text-xs font-semibold text-muted-foreground">
                  #
                </TableHead>
                <Th k="name">Candidate &amp; Role</Th>
                <Th k="score" className="w-28">
                  Score
                </Th>
                <Th k="tier" className="w-36">
                  Readiness
                </Th>
                <Th k="jd" className="w-24">
                  JD Match
                </Th>
                <Th k="issues" className="w-28">
                  Issues
                </Th>
                <Th k="missing">Skill Gaps</Th>
                <TableHead className="w-28 text-right text-xs font-semibold text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/60">
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-xs text-muted-foreground"
                  >
                    No candidates found matching your filter.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((row, index) => {
                const a = row.analysis;
                const score = effectiveScore(a);
                const critical = a.criticalIssues.filter((i) => i.severity === "critical").length;
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-secondary/30"
                    onClick={() => onOpen(row.id)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[17rem] truncate text-xs font-semibold text-foreground">
                        {a.candidateName}
                      </p>
                      <p className="max-w-[17rem] truncate text-xs text-muted-foreground mt-0.5">
                        {a.role} <span className="opacity-60">· {row.fileName}</span>
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center justify-center rounded-lg px-2.5 py-0.5 font-mono text-xs font-bold ${
                            score >= 75
                              ? "bg-success/15 text-success border border-success/30"
                              : score >= 55
                                ? "bg-warning/15 text-warning border border-warning/30"
                                : "bg-destructive/15 text-destructive border border-destructive/30"
                          }`}
                        >
                          {score}
                        </span>
                        {a.manualScore !== null && (
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">
                            (edited)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`whitespace-nowrap text-xs font-medium rounded-md ${tierTone(a.readinessTier)}`}
                      >
                        {a.readinessTier.replace(/^Tier \d: /, "")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {a.jdScore !== null ? (
                        <span className="text-foreground">{a.jdScore}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-medium ${
                          critical > 0 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {critical > 0 ? `${critical} critical` : "0 issues"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[18rem] flex-wrap gap-1">
                        {a.skillMatrix.missing.slice(0, 3).map((s, i) => (
                          <span
                            key={i}
                            className="rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] text-muted-foreground border border-border/50"
                          >
                            {s}
                          </span>
                        ))}
                        {a.skillMatrix.missing.length > 3 && (
                          <span className="text-[11px] text-muted-foreground self-center">
                            +{a.skillMatrix.missing.length - 3} more
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex justify-end gap-1.5"
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
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                          onClick={() => onExportPdf(row.id)}
                          aria-label="Download candidate scorecard PDF"
                        >
                          <FileDown className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
