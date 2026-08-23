import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  LayoutGrid,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Square,
  Trash2,
  Trophy,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Leaderboard } from "@/components/Leaderboard";
import { MasterTable } from "@/components/MasterTable";
import { RectifyDrawer, type RectifyTarget } from "@/components/RectifyDrawer";
import { SettingsDialog } from "@/components/SettingsDialog";
import { effectiveScore, normalizeAnalysis, type Analysis } from "@/lib/analysis-types";
import { collectFiles, extractText, type ExtractedFile } from "@/lib/extract";
import { LlmError, callModel, DEFAULT_SETTINGS, type LlmSettings } from "@/lib/llm";
import { findModel } from "@/lib/models";
import { RateLimitedQueue } from "@/lib/queue";
import {
  saveAnalysis,
  loadAnalyses,
  clearAnalyses,
  deleteStoredAnalysis,
  deleteStoredAnalyses,
  type StoredAnalysis,
} from "@/lib/storage";
import { getPublicSystemInfoFn } from "@/lib/database.server";
import { exportBatchMarkdown, exportCsv, exportScorecardPdf } from "@/lib/report";
import { sanitizeResumeText, type TextFix } from "@/lib/sanitize";
import { loadSettings, saveSettings } from "@/lib/settings";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bulk Resume Analyzer — Campus Placement Screening" },
      {
        name: "description",
        content:
          "Upload a ZIP of student resumes and get HR-level scores, critical issues, skill gaps, bullet rewrites and export-ready reports. Runs entirely in your browser.",
      },
      { property: "og:title", content: "Bulk Resume Analyzer — Campus Placement Screening" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Status = "queued" | "extracting" | "analyzing" | "retrying" | "done" | "error" | "cancelled";

type QueueItem = {
  id: string;
  file: ExtractedFile;
  status: Status;
  progress: number;
  message: string;
  attempt: number;
  rawText: string;
  cleanText: string;
  fixes: TextFix[];
  warnings: string[];
  analysis: Analysis | null;
  durationMs: number | null;
};

export type SystemInfo = {
  hasServerNvidiaKey: boolean;
  hasServerGeminiKey: boolean;
  defaultRole: string;
  companyName: string;
  defaultModelId?: string;
  databaseConnected?: boolean;
};

function Index() {
  // NOTE: this app is server-rendered, so localStorage is unavailable on the
  // first render. Start from defaults and hydrate settings in an effect —
  // otherwise the stored API key is invisible to the client after hydration.
  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_SETTINGS);
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    hasServerNvidiaKey: false,
    hasServerGeminiKey: false,
    defaultRole: "Software Engineer (Entry Level)",
    companyName: "the hiring company",
    defaultModelId: "",
    databaseConnected: true,
  });
  const [items, setItems] = useState<QueueItem[]>([]);
  const [tab, setTab] = useState<"analyze" | "leaderboard">("analyze");
  const [jd, setJd] = useState("");
  const [useJd, setUseJd] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(70);
  const [concurrency, setConcurrency] = useState(1);
  const [maxRetries, setMaxRetries] = useState(3);
  const [running, setRunning] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const queueRef = useRef<RateLimitedQueue<Analysis> | null>(null);

  const refreshSystemInfo = useCallback(async () => {
    try {
      const info = await getPublicSystemInfoFn();
      if (info) {
        setSystemInfo(info);
        if (
          info.defaultModelId &&
          typeof window !== "undefined" &&
          !window.localStorage.getItem("resume-radiance.settings.v1")
        ) {
          setSettings((prev) => ({ ...prev, modelId: info.defaultModelId! }));
          const m = findModel(info.defaultModelId);
          if (m?.recommendedConcurrency) {
            setConcurrency(m.recommendedConcurrency);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Hydrate settings, cloud database analyses, and MongoDB public system info on mount
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    const m = findModel(loaded.modelId);
    if (m?.recommendedConcurrency) {
      setConcurrency(m.recommendedConcurrency);
    }

    void refreshSystemInfo();

    void loadAnalyses()
      .then((saved) => {
        if (saved && Array.isArray(saved) && saved.length > 0) {
          setItems((prev) => {
            if (prev.length > 0) return prev;
            return saved
              .filter((s) => s && (s.analysis || s.candidate_name))
              .map((s) => {
                const normalized = normalizeAnalysis(s.analysis ?? s);
                return {
                  id: s.id || Math.random().toString(36).slice(2),
                  file: {
                    name: s.file_name || `${normalized.candidateName}.pdf`,
                    bytes: new Uint8Array(0),
                    kind: "pdf" as const,
                  },
                  status: "done" as Status,
                  progress: 100,
                  message: "",
                  attempt: 1,
                  rawText: s.raw_text || "",
                  cleanText: s.clean_text || "",
                  fixes: [] as TextFix[],
                  warnings: [] as string[],
                  analysis: normalized,
                  durationMs: null,
                };
              });
          });
        }
      })
      .catch((err) => {
        console.warn("[storage] Stored analysis hydration failed:", err);
      });
  }, [refreshSystemInfo]);

  const patch = useCallback((id: string, next: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }, []);

  const persist = useCallback((next: LlmSettings) => {
    setSettings(next);
    saveSettings(next);
    const m = findModel(next.modelId);
    if (m?.recommendedConcurrency) {
      setConcurrency(m.recommendedConcurrency);
    }
  }, []);

  /* ------------------------------ file intake ----------------------------- */

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const toastId = toast.loading("Loading files…");
      try {
        const files = await collectFiles(Array.from(fileList));
        if (!files.length) {
          toast.error("No readable resumes found (PDF, Word, images or text).", { id: toastId });
          return;
        }
        const stamp = Date.now();
        const freshItems: QueueItem[] = [];

        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.file.name));
          const fresh = files.filter((f) => !seen.has(f.name));
          const skipped = files.length - fresh.length;
          if (skipped > 0) toast.info(`${skipped} duplicate file name(s) skipped.`);

          const created = fresh.map((file, i) => {
            const id = `${stamp}-${i}-${file.name}`;
            const it: QueueItem = {
              id,
              file,
              status: "queued" as Status,
              progress: 0,
              message: "Preparing...",
              attempt: 0,
              rawText: "",
              cleanText: "",
              fixes: [] as TextFix[],
              warnings: [] as string[],
              analysis: null,
              durationMs: null,
            };
            freshItems.push(it);
            return it;
          });
          return [...prev, ...created];
        });

        toast.success(`${files.length} resume${files.length > 1 ? "s" : ""} ready for analysis.`, {
          id: toastId,
        });

        // Optimistic background pre-extraction: extract and clean text immediately!
        freshItems.forEach(async (item) => {
          try {
            const raw = await extractText(item.file);
            const { clean, fixes, warnings } = sanitizeResumeText(raw);
            patch(item.id, {
              rawText: raw,
              cleanText: clean,
              fixes,
              warnings,
              progress: 10,
              message: "Ready",
            });
          } catch {
            // If background extraction errors, standard analyzeOne will handle/report it.
          }
        });
      } catch {
        toast.error("Could not read that archive. Make sure the ZIP isn't password protected.", {
          id: toastId,
        });
      }
    },
    [patch],
  );

  /* ------------------------------- analysis ------------------------------- */

  /** Extract + sanitize (cached) then call the model with optimistic live phases. */
  const analyzeOne = useCallback(
    async (
      item: QueueItem,
      signal: AbortSignal,
      attempt: number,
      overrideJd?: string | false,
    ): Promise<Analysis> => {
      let clean = item.cleanText;
      let fixes = item.fixes;
      let warnings = item.warnings;
      let raw = item.rawText;

      // 1. If not yet pre-extracted in the background, extract now:
      if (!clean) {
        if (!item.file.bytes || item.file.bytes.length === 0) {
          if (item.analysis) {
            const a = item.analysis;
            clean = [
              `Candidate Name: ${a.candidateName}`,
              `Target Role: ${a.role}`,
              `Assumed Role: ${a.assumedRole}`,
              `Executive Summary: ${a.summary}`,
              `Recruiter Impression: ${a.recruiterFirstImpression}`,
              `Matched Skills: ${(a.skillMatrix?.matched || []).join(", ")}`,
              `Missing Skills: ${(a.skillMatrix?.missing || []).join(", ")}`,
              `Additional Skills: ${(a.skillMatrix?.additional || []).join(", ")}`,
              `Strengths: ${(a.strengths || []).join("; ")}`,
              `Critical Issues: ${(a.criticalIssues || []).map((ci) => `${ci.title}: ${ci.detail}`).join("; ")}`,
              `Action Roadmap: ${(a.actionRoadmap || []).join("; ")}`,
            ].join("\n\n");
            patch(item.id, { cleanText: clean });
          } else {
            throw new LlmError("No resume text or binary available for analysis.", null, false);
          }
        } else {
          patch(item.id, {
            status: "extracting",
            progress: 15,
            message: "Extracting resume text…",
            attempt,
          });
          raw = await extractText(item.file, (pct) =>
            patch(item.id, { progress: 15 + pct * 0.25, message: `OCR ${pct}%` }),
          );
          const result = sanitizeResumeText(raw);
          clean = result.clean;
          fixes = result.fixes;
          warnings = result.warnings;

          if (clean.replace(/\s/g, "").length < 100) {
            throw new LlmError(
              "Too little readable text — this file is likely a scan or an empty document.",
              null,
              false,
            );
          }
          patch(item.id, { rawText: raw, cleanText: clean, fixes, warnings });
        }
      }

      // 2. Start optimistic live progress timer for responsive real-time feedback
      const startTime = Date.now();
      const phases = [
        { progress: 35, msg: "Auditing skills & career history..." },
        { progress: 55, msg: "Benchmarking ATS parseability & impact..." },
        { progress: 75, msg: "Scoring candidate competencies..." },
        { progress: 90, msg: "Finalizing recruiter verdict & rewrites..." },
      ];

      patch(item.id, {
        status: "analyzing",
        progress: 25,
        message: attempt > 1 ? `AI analysis (attempt ${attempt})...` : phases[0]!.msg,
        attempt,
      });

      let phaseIdx = 0;
      const timer = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const currentPhase = phases[phaseIdx] || phases[phases.length - 1]!;
        if (phaseIdx < phases.length - 1) phaseIdx++;
        patch(item.id, {
          status: "analyzing",
          progress: currentPhase.progress,
          message: `${currentPhase.msg} (${elapsed}s)`,
        });
      }, 750);

      const activeJd =
        overrideJd !== undefined
          ? (typeof overrideJd === "string" && overrideJd.trim() ? overrideJd.trim() : undefined)
          : (useJd && jd.trim() ? jd.trim() : undefined);

      try {
        const raw2 = await callModel(
          {
            fileName: item.file.name,
            resumeText: clean,
            defaultRole: settings.defaultRole,
            companyName: settings.companyName,
            ...(activeJd ? { jobDescription: activeJd } : {}),
          },
          settings,
          signal,
        );

        return normalizeAnalysis(raw2);
      } finally {
        clearInterval(timer);
      }
    },
    [patch, settings, useJd, jd],
  );

  const runBatch = useCallback(() => {
    const activeM = findModel(settings.modelId);
    const hasKey =
      activeM.provider === "litellm" ||
      activeM.provider === "openai-compatible" ||
      activeM.provider === "ollama" ||
      Boolean(settings.apiKey.trim()) ||
      Boolean(settings.proxyUrl.trim()) ||
      (activeM.provider === "groq" && (systemInfo as Record<string, unknown>).hasServerGroqKey) ||
      (activeM.provider === "cerebras" && (systemInfo as Record<string, unknown>).hasServerCerebrasKey) ||
      (activeM.provider === "openrouter" && (systemInfo as Record<string, unknown>).hasServerOpenRouterKey) ||
      (activeM.provider === "nvidia" && systemInfo.hasServerNvidiaKey) ||
      (activeM.provider === "gemini" && systemInfo.hasServerGeminiKey);

    if (!hasKey) {
      toast.error(
        `No API key configured in MongoDB for ${activeM.label}. Please open the Admin Portal (/admin) or AI Settings to add your key.`,
      );
      return;
    }

    const pending = items.filter((i) => i.status !== "done");
    if (!pending.length) {
      toast.error("Nothing left to analyze.");
      return;
    }

    setRunning(true);
    const started = new Map<string, number>();

    const queue = new RateLimitedQueue<Analysis>(
      { concurrency, cooldownSec, maxRetries, retryBackoffSec: Math.max(2, cooldownSec) },
      {
        onStart: (id, attempt) => {
          started.set(id, Date.now());
          patch(id, { attempt });
        },
        onSuccess: (id, analysis) => {
          patch(id, {
            status: "done",
            progress: 100,
            message: "",
            analysis,
            durationMs: Date.now() - (started.get(id) ?? Date.now()),
          });
          const item = itemsRef.current.find((i) => i.id === id);
          void saveAnalysis({
            id,
            fileName: item?.file.name ?? id,
            analysis,
            cleanText: item?.cleanText,
            rawText: item?.rawText,
          }).catch(() => {});
        },
        onError: (id, message, willRetry, retryInSec) => {
          patch(id, {
            status: willRetry ? "retrying" : "error",
            progress: willRetry ? 50 : 100,
            message: willRetry ? `${message} — retrying in ${retryInSec}s` : message,
            durationMs: Date.now() - (started.get(id) ?? Date.now()),
          });
        },
        onRetryWait: (id, secondsLeft) =>
          patch(id, { message: `Rate limited — retrying in ${secondsLeft}s` }),
        onCooldown: (secondsLeft) => setCooldownLeft(secondsLeft),
        onIdle: () => {
          setRunning(false);
          setCooldownLeft(0);
          toast.success("Batch complete.");
        },
      },
    );

    const activeJd = (useJd || jd.trim().length > 0) && jd.trim() ? jd.trim() : undefined;
    queueRef.current = queue;
    queue.add(
      pending.map((item) => ({
        id: item.id,
        run: ({ signal, attempt }) => {
          // Always read the latest copy so drawer edits are picked up.
          const latest = itemsRef.current.find((i) => i.id === item.id) ?? item;
          return analyzeOne(latest, signal, attempt, activeJd);
        },
        isRetryable: (error: unknown) => (error instanceof LlmError ? error.retryable : true),
      })),
    );

    void queue.run();
  }, [items, settings, concurrency, cooldownSec, maxRetries, patch, analyzeOne, useJd, jd]);

  // Mirror items into a ref so queue tasks always read fresh text/edits.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const stop = useCallback(() => {
    queueRef.current?.stop();
    setRunning(false);
    setCooldownLeft(0);
    setItems((prev) =>
      prev.map((i) =>
        i.status === "queued" ||
        i.status === "extracting" ||
        i.status === "analyzing" ||
        i.status === "retrying"
          ? { ...i, status: "cancelled", message: "Stopped by user", progress: 100 }
          : i,
      ),
    );
    toast.info("Batch stopped.");
  }, []);

  useEffect(() => () => queueRef.current?.stop(), []);

  /* -------------------------------- derived -------------------------------- */

  const stats = useMemo(() => {
    const done = items.filter((i) => i.status === "done" && i.analysis);
    const failed = items.filter((i) => i.status === "error");
    const pending = items.filter(
      (i) => i.status === "queued" || i.status === "extracting" || i.status === "analyzing",
    );
    const retrying = items.filter((i) => i.status === "retrying");
    const avg = done.length
      ? Math.round(done.reduce((s, i) => s + effectiveScore(i.analysis!), 0) / done.length)
      : 0;
    const tier1 = done.filter((i) => i.analysis!.readinessTier.startsWith("Tier 1")).length;
    return {
      total: items.length,
      done: done.length,
      failed: failed.length,
      pending: pending.length,
      retrying: retrying.length,
      avg,
      tier1,
      doneRows: done.map((i) => ({ id: i.id, fileName: i.file.name, analysis: i.analysis! })),
    };
  }, [items]);

  const overallProgress = stats.total ? (stats.done / stats.total) * 100 : 0;

  const drawerTarget = useMemo<RectifyTarget | null>(() => {
    const item = items.find((i) => i.id === drawerId);
    if (!item?.analysis) return null;
    return {
      id: item.id,
      fileName: item.file.name,
      analysis: item.analysis,
      rawText: item.rawText,
      cleanText: item.cleanText,
      fixes: item.fixes,
      warnings: item.warnings,
    };
  }, [items, drawerId]);

  /* -------------------------------- actions -------------------------------- */

  const applyRectify = useCallback(
    (id: string, p: { cleanText: string; manualScore: number | null; officerNotes: string }) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id === id && i.analysis) {
            const updatedAnalysis: Analysis = {
              ...i.analysis,
              manualScore: p.manualScore,
              officerNotes: p.officerNotes,
            };
            void saveAnalysis({
              id,
              fileName: i.file.name,
              analysis: updatedAnalysis,
            }).catch(() => {});
            return {
              ...i,
              cleanText: p.cleanText,
              analysis: updatedAnalysis,
            };
          }
          return i;
        }),
      );
      toast.success("Changes saved and synced to cloud.");
    },
    [],
  );

  const reanalyzeOne = useCallback(
    (id: string) => {
      if (running) {
        toast.error("Wait for the current batch to finish.");
        return;
      }
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;

      setRunning(true);
      patch(id, { status: "analyzing", progress: 50, message: "Re-analyzing…" });

      const queue = new RateLimitedQueue<Analysis>(
        { concurrency: 1, cooldownSec: 0, maxRetries, retryBackoffSec: 3 },
        {
          onSuccess: (rid, analysis) => {
            // Preserve officer overrides across a re-analysis.
            const prevAnalysis = itemsRef.current.find((i) => i.id === rid)?.analysis;
            patch(rid, {
              status: "done",
              progress: 100,
              message: "",
              analysis: {
                ...analysis,
                manualScore: prevAnalysis?.manualScore ?? null,
                officerNotes: prevAnalysis?.officerNotes ?? "",
              },
            });
            toast.success("Re-analyzed with your corrected text.");
          },
          onError: (rid, message, willRetry) => {
            if (!willRetry) {
              patch(rid, { status: "error", progress: 100, message });
              toast.error(message);
            }
          },
          onIdle: () => setRunning(false),
        },
      );
      queueRef.current = queue;
      const targetJd = useJd && jd.trim() ? jd.trim() : undefined;
      queue.add([
        {
          id,
          run: ({ signal, attempt }) => {
            const latest = itemsRef.current.find((i) => i.id === id)!;
            return analyzeOne(latest, signal, attempt, targetJd);
          },
          isRetryable: (e: unknown) => (e instanceof LlmError ? e.retryable : true),
        },
      ]);
      void queue.run();
    },
    [running, maxRetries, patch, analyzeOne, useJd, jd],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (drawerId === id) setDrawerId(null);
      await deleteStoredAnalysis(id);
      toast.success("Candidate record deleted.");
    },
    [drawerId],
  );

  const deleteManyItems = useCallback(
    async (ids: string[]) => {
      if (!ids || ids.length === 0) return;
      const idSet = new Set(ids);
      setItems((prev) => prev.filter((i) => !idSet.has(i.id)));
      if (drawerId && idSet.has(drawerId)) setDrawerId(null);
      await deleteStoredAnalyses(ids);
      toast.success(`Deleted ${ids.length} candidate records.`);
    },
    [drawerId],
  );

  const reanalyzeWithCurrentJd = useCallback(
    (candidateIds?: string[]) => {
      if (running) {
        toast.error("Wait for the current batch to finish.");
        return;
      }
      const activeJd = jd.trim();
      if (!activeJd) {
        toast.error("Please paste a Job Description first.");
        return;
      }
      if (!useJd) {
        setUseJd(true);
      }

      const activeM = findModel(settings.modelId);
      const hasKey =
        activeM.provider === "litellm" ||
        activeM.provider === "openai-compatible" ||
        activeM.provider === "ollama" ||
        Boolean(settings.apiKey.trim()) ||
        Boolean(settings.proxyUrl.trim()) ||
        (activeM.provider === "groq" && (systemInfo as Record<string, unknown>).hasServerGroqKey) ||
        (activeM.provider === "cerebras" && (systemInfo as Record<string, unknown>).hasServerCerebrasKey) ||
        (activeM.provider === "openrouter" && (systemInfo as Record<string, unknown>).hasServerOpenRouterKey) ||
        (activeM.provider === "nvidia" && systemInfo.hasServerNvidiaKey) ||
        (activeM.provider === "gemini" && systemInfo.hasServerGeminiKey);

      if (!hasKey) {
        toast.error(
          `No API key configured in MongoDB for ${activeM.label}. Please open Admin Portal (/admin) or AI Settings to add your key.`,
        );
        return;
      }

      const idSet = candidateIds && candidateIds.length > 0 ? new Set(candidateIds) : null;
      const targetItems = itemsRef.current.filter((i) => !idSet || idSet.has(i.id));
      if (!targetItems.length) {
        toast.error("No candidates to re-evaluate.");
        return;
      }

      setItems((prev) =>
        prev.map((i) =>
          !idSet || idSet.has(i.id)
            ? { ...i, status: "queued", progress: 0, message: "Queued for JD re-evaluation…" }
            : i,
        ),
      );

      setRunning(true);
      const started = new Map<string, number>();

      const queue = new RateLimitedQueue<Analysis>(
        { concurrency, cooldownSec, maxRetries, retryBackoffSec: Math.max(2, cooldownSec) },
        {
          onStart: (id, attempt) => {
            started.set(id, Date.now());
            patch(id, { attempt, status: "analyzing" });
          },
          onSuccess: (id, analysis) => {
            const prevAnalysis = itemsRef.current.find((i) => i.id === id)?.analysis;
            const merged: Analysis = {
              ...analysis,
              manualScore: prevAnalysis?.manualScore ?? null,
              officerNotes: prevAnalysis?.officerNotes ?? "",
            };
            patch(id, {
              status: "done",
              progress: 100,
              message: "",
              analysis: merged,
              durationMs: Date.now() - (started.get(id) ?? Date.now()),
            });
            const item = itemsRef.current.find((i) => i.id === id);
            void saveAnalysis({
              id,
              fileName: item?.file.name ?? id,
              analysis: merged,
              cleanText: item?.cleanText,
              rawText: item?.rawText,
            }).catch(() => {});
          },
          onError: (id, message, willRetry, retryInSec) => {
            patch(id, {
              status: willRetry ? "retrying" : "error",
              progress: willRetry ? 50 : 100,
              message: willRetry ? `${message} — retrying in ${retryInSec}s` : message,
              durationMs: Date.now() - (started.get(id) ?? Date.now()),
            });
          },
          onRetryWait: (id, secondsLeft) =>
            patch(id, { message: `Rate limited — retrying in ${secondsLeft}s` }),
          onCooldown: (secondsLeft) => setCooldownLeft(secondsLeft),
          onIdle: () => {
            setRunning(false);
            setCooldownLeft(0);
            toast.success("Job Description re-evaluation complete.");
          },
        },
      );

      queueRef.current = queue;
      queue.add(
        targetItems.map((item) => ({
          id: item.id,
          run: ({ signal, attempt }) => {
            const latest = itemsRef.current.find((i) => i.id === item.id) ?? item;
            return analyzeOne(latest, signal, attempt, activeJd);
          },
          isRetryable: (error: unknown) => (error instanceof LlmError ? error.retryable : true),
        })),
      );

      void queue.run();
      toast.info(`Started re-evaluating ${targetItems.length} candidate(s) against current JD.`);
    },
    [running, jd, useJd, settings, systemInfo, concurrency, cooldownSec, maxRetries, patch, analyzeOne],
  );

  const exportPdf = useCallback(async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item?.analysis) return;
    try {
      await exportScorecardPdf(item.file.name, item.analysis);
      toast.success("Scorecard PDF downloaded.");
    } catch (e) {
      toast.error(`PDF export failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }, []);

  const doExportCsv = useCallback(async () => {
    if (!stats.doneRows.length) return;
    try {
      await exportCsv(stats.doneRows.map(({ fileName, analysis }) => ({ fileName, analysis })));
      toast.success(`CSV with ${stats.doneRows.length} candidates downloaded.`);
    } catch (e) {
      toast.error(`CSV export failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }, [stats.doneRows]);

  const retryFailed = useCallback(() => {
    setItems((prev) =>
      prev.map((i) =>
        i.status === "error" || i.status === "cancelled"
          ? { ...i, status: "queued", message: "", progress: 0 }
          : i,
      ),
    );
    toast.info("Failed items re-queued. Press Start batch.");
  }, []);

  /* ---------------------------------- view --------------------------------- */

  const activeModel = findModel(settings.modelId);
  const hasActiveJd = Boolean(useJd && jd.trim());

  return (
    <main className="min-h-screen bg-background text-foreground pb-16">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 group">
              <img
                src="/favicon.png"
                alt="College Logo"
                className="size-8 object-contain group-hover:scale-105 transition-transform"
              />
              <span className="hidden font-bold tracking-tight text-sm sm:inline-block">
                VSB Portal
              </span>
            </Link>

            <div className="flex items-center gap-1.5 bg-secondary/30 p-1 rounded-xl border border-border/70">
              <TabButton
                active={tab === "analyze"}
                onClick={() => setTab("analyze")}
                icon={<LayoutGrid className="size-3.5" />}
                label="Analyze"
              />
              <TabButton
                active={tab === "leaderboard"}
                onClick={() => setTab("leaderboard")}
                icon={<Trophy className="size-3.5" />}
                label={`Leaderboard${stats.doneRows.length ? ` (${stats.doneRows.length})` : ""}`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-border/80 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <span className="size-2 rounded-full bg-success" />
              <span className="font-medium text-foreground">{activeModel.label}</span>
            </div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-secondary/30 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Shield className="size-3.5 text-primary" /> Admin
            </Link>
            <SettingsDialog
              settings={settings}
              systemInfo={systemInfo}
              onRefreshSystem={refreshSystemInfo}
              onSave={persist}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-8">
        {tab === "analyze" ? (
          <AnalyzeView
            items={items}
            stats={stats}
            running={running}
            cooldownLeft={cooldownLeft}
            overallProgress={overallProgress}
            activeModel={activeModel}
            handlers={{
              onFiles: handleFiles,
              onRun: runBatch,
              onStop: stop,
              onRetry: retryFailed,
              onClear: async () => {
                if (confirm("Clear all loaded and analyzed candidates?")) {
                  setItems([]);
                  await clearAnalyses();
                  toast.success("All candidate records cleared.");
                }
              },
              onDelete: deleteItem,
              onDeleteMany: deleteManyItems,
              onReevaluate: (id) => reanalyzeWithCurrentJd([id]),
              onReevaluateMany: (ids) => reanalyzeWithCurrentJd(ids),
              onReevaluateAllJd: () => reanalyzeWithCurrentJd(),
              onExportCsv: doExportCsv,
              onExportMd: () =>
                exportBatchMarkdown(
                  stats.doneRows.map(({ fileName, analysis }) => ({ fileName, analysis })),
                ),
              onOpen: setDrawerId,
              onExportPdf: (id) => void exportPdf(id),
              setDragging,
            }}
            control={{
              useJd,
              setUseJd,
              jd,
              setJd,
              cooldownSec,
              setCooldownSec,
              concurrency,
              setConcurrency,
              maxRetries,
              setMaxRetries,
            }}
          />
        ) : (
          <section className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Candidate Leaderboard
              </h1>
              <p className="text-sm text-muted-foreground">
                All {stats.doneRows.length} assessed resumes ranked by final score. Use this to
                shortlist and compare at a glance.
              </p>
            </div>
            <Leaderboard
              rows={stats.doneRows}
              onOpen={setDrawerId}
              onDelete={deleteItem}
              onReevaluate={(id) => reanalyzeWithCurrentJd([id])}
              hasActiveJd={hasActiveJd}
            />
          </section>
        )}
      </div>

      <RectifyDrawer
        target={drawerTarget}
        open={Boolean(drawerId)}
        onOpenChange={(v) => !v && setDrawerId(null)}
        onApply={applyRectify}
        onReanalyze={reanalyzeOne}
        onExportPdf={(id) => void exportPdf(id)}
        onDelete={deleteItem}
        hasActiveJd={hasActiveJd}
        onReanalyzeWithJd={(id) => reanalyzeWithCurrentJd([id])}
      />
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
        active
          ? "bg-card text-foreground shadow-sm font-semibold border border-border/60"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

type Stats = {
  total: number;
  done: number;
  failed: number;
  pending: number;
  retrying: number;
  avg: number;
  tier1: number;
  doneRows: { id: string; fileName: string; analysis: Analysis }[];
};

function AnalyzeView({
  items,
  stats,
  running,
  cooldownLeft,
  overallProgress,
  activeModel,
  handlers,
  control,
}: {
  items: QueueItem[];
  stats: Stats;
  running: boolean;
  cooldownLeft: number;
  overallProgress: number;
  activeModel: import("@/lib/models").ModelOption;
  handlers: {
    onFiles: (files: FileList | null) => void;
    onRun: () => void;
    onStop: () => void;
    onRetry: () => void;
    onClear: () => void;
    onDelete?: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
    onReevaluate?: (id: string) => void;
    onReevaluateMany?: (ids: string[]) => void;
    onReevaluateAllJd?: () => void;
    onExportCsv: () => void;
    onExportMd: () => void;
    onOpen: (id: string) => void;
    onExportPdf: (id: string) => void;
    setDragging: (v: boolean) => void;
  };
  control: {
    useJd: boolean;
    setUseJd: (v: boolean) => void;
    jd: string;
    setJd: (v: string) => void;
    cooldownSec: number;
    setCooldownSec: (v: number) => void;
    concurrency: number;
    setConcurrency: (v: number) => void;
    maxRetries: number;
    setMaxRetries: (v: number) => void;
  };
}) {
  const dragging = useRef(false);
  return (
    <div className="space-y-8">
      {/* Intro */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Evaluate Resumes in Bulk
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Upload a ZIP of resumes or individual files. Each one is assessed for structure, missing
          information, role relevance and honest, student-improving feedback — then ranked.
        </p>
      </div>

      {/* Input & Settings Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Column 1: Upload & Job Description (7 cols) */}
        <section className="panel flex flex-col justify-between overflow-hidden lg:col-span-7">
          <div className="panel-header flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Upload className="size-4 text-primary" />
              <span>1. Upload Resumes</span>
            </div>
            {items.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {items.length} file{items.length > 1 ? "s" : ""} selected
              </span>
            )}
          </div>

          <div className="panel-body flex-1 space-y-5">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                handlers.setDragging(true);
              }}
              onDragLeave={() => handlers.setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                handlers.setDragging(false);
                void handlers.onFiles(e.dataTransfer.files);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                dragging.current
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary/30 hover:border-primary/60 hover:bg-secondary/50"
              }`}
            >
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-secondary text-foreground">
                <Upload className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Drag and drop resumes here, or click to browse
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Supports .zip folder, PDF, Word (.docx, .doc), text, and image scans
              </p>
              <input
                type="file"
                multiple
                accept=".zip,.pdf,.doc,.docx,.txt,.md,.rtf,.csv,image/*"
                className="hidden"
                onChange={(e) => void handlers.onFiles(e.target.files)}
              />
            </label>

            {/* Job Description Card */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="jd-toggle"
                    className="text-xs font-semibold text-foreground cursor-pointer"
                  >
                    Match against a specific Job Description
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {control.useJd
                      ? "Acting as that company's hiring manager — blunt about fit."
                      : "Off: assesses against the default role set in AI Engine."}
                  </p>
                </div>
                <Switch id="jd-toggle" checked={control.useJd} onCheckedChange={control.setUseJd} />
              </div>

              {control.useJd && (
                <div className="space-y-2.5">
                  <Textarea
                    value={control.jd}
                    onChange={(e) => control.setJd(e.target.value)}
                    placeholder="Paste the full job description or key requirements here…"
                    className="min-h-28 text-xs leading-relaxed rounded-lg"
                  />
                  {control.jd.trim() && items.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-muted-foreground">
                        Ready to re-evaluate {items.length} candidate{items.length > 1 ? "s" : ""} against this JD
                      </span>
                      {handlers.onReevaluateAllJd && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={handlers.onReevaluateAllJd}
                          disabled={running}
                          className="h-7 text-xs font-semibold rounded-lg shadow-sm"
                        >
                          <Sparkles className="size-3.5 mr-1.5" />
                          Re-evaluate All with Current JD
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Column 2: Controls & Actions (5 cols) */}
        <section className="panel flex flex-col justify-between overflow-hidden lg:col-span-5">
          <div className="panel-header flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <RotateCcw className="size-4 text-primary" />
              <span>2. Screening Settings</span>
            </div>
            {running && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <Loader2 className="size-3.5 animate-spin" /> Analyzing...
              </span>
            )}
          </div>

          <div className="panel-body flex-1 space-y-5">
            {/* Sliders */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Request Cooldown</span>
                  <span className="font-medium font-mono text-foreground">
                    {control.cooldownSec}s delay
                  </span>
                </div>
                <Slider
                  value={[control.cooldownSec]}
                  min={0}
                  max={30}
                  step={1}
                  disabled={running}
                  onValueChange={([v]) => control.setCooldownSec(v ?? 0)}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Concurrency</span>
                  <span className="font-medium font-mono text-foreground">
                    {control.concurrency} worker{control.concurrency > 1 ? "s" : ""}
                  </span>
                </div>
                <Slider
                  value={[control.concurrency]}
                  min={1}
                  max={3}
                  step={1}
                  disabled={running}
                  onValueChange={([v]) => control.setConcurrency(v ?? 1)}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Auto-Retries on Error</span>
                  <span className="font-medium font-mono text-foreground">
                    {control.maxRetries} attempt{control.maxRetries > 1 ? "s" : ""}
                  </span>
                </div>
                <Slider
                  value={[control.maxRetries]}
                  min={0}
                  max={5}
                  step={1}
                  disabled={running}
                  onValueChange={([v]) => control.setMaxRetries(v ?? 0)}
                />
              </div>
            </div>

            {/* Live Metric Cards */}
            <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-secondary/30 p-2.5 text-center">
              <StatPill label="Total" value={stats.total} />
              <StatPill label="Done" value={stats.done} tone="text-foreground font-bold" />
              <StatPill label="Shortlist" value={stats.tier1} tone="text-success font-bold" />
              <StatPill
                label="Avg Score"
                value={stats.avg > 0 ? stats.avg : "—"}
                tone="text-primary font-bold"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <Button
                onClick={handlers.onRun}
                disabled={running || !items.length}
                className="w-full h-10 font-semibold shadow-sm text-sm"
              >
                {running ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Play className="size-4 mr-2 fill-current" />
                )}
                {running ? "Analyzing Resumes..." : "Start Batch Analysis"}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!running}
                  onClick={handlers.onStop}
                  className="flex-1 text-xs"
                >
                  <Square className="size-3.5 mr-1" /> Stop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    running || (!stats.failed && !items.some((i) => i.status === "cancelled"))
                  }
                  onClick={handlers.onRetry}
                  className="flex-1 text-xs"
                >
                  <RotateCcw className="size-3.5 mr-1" /> Retry Failed
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={running || !items.length}
                  onClick={handlers.onClear}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5 mr-1" /> Clear
                </Button>
              </div>
            </div>

            {(running || stats.done > 0) && (
              <div className="space-y-1.5 pt-1">
                <Progress value={overallProgress} className="h-2 rounded-full" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {stats.done} of {stats.total} resumes processed ({Math.round(overallProgress)}
                    %)
                  </span>
                  <span>
                    {cooldownLeft > 0 && `Waiting ${cooldownLeft}s · `}
                    {stats.retrying > 0 && `${stats.retrying} retrying`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Live Queue */}
      {items.some((i) => i.status !== "done") && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Live Queue ({items.filter((i) => i.status !== "done").length} items)
            </h2>
          </div>

          <div className="panel divide-y divide-border overflow-hidden">
            {items
              .filter((i) => i.status !== "done")
              .map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <StatusDot status={item.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {item.file.name}
                      </span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase font-medium text-muted-foreground">
                        {item.file.kind}
                      </span>
                      {item.attempt > 1 && (
                        <span className="rounded bg-warning/15 border border-warning/30 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          Attempt {item.attempt}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs mt-0.5">
                      {item.status === "error" || item.status === "cancelled" ? (
                        <span className="text-destructive font-medium">{item.message}</span>
                      ) : item.status === "retrying" ? (
                        <span className="text-warning font-medium">{item.message}</span>
                      ) : item.status === "analyzing" ? (
                        <span className="text-primary font-medium">{item.message}</span>
                      ) : (
                        <span className="text-muted-foreground">{item.message || item.status}</span>
                      )}
                    </p>
                    {(item.status === "extracting" ||
                      item.status === "analyzing" ||
                      item.status === "retrying") && (
                      <div className="mt-2 h-1.5 w-full bg-secondary/80 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-primary animate-pulse transition-all duration-500"
                          style={{ width: `${Math.max(12, item.progress)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Results Register */}
      {stats.doneRows.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Candidate Rankings &amp; Audit
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stats.doneRows.length} candidates assessed · {stats.tier1} ready for shortlist
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handlers.onExportCsv}>
                <FileSpreadsheet className="size-4 mr-1.5" /> Export Placement CSV
              </Button>
              <Button size="sm" variant="outline" onClick={handlers.onExportMd}>
                <Download className="size-4 mr-1.5" /> Download Reports (MD)
              </Button>
            </div>
          </div>

          <MasterTable
            rows={stats.doneRows}
            onOpen={handlers.onOpen}
            onExportPdf={handlers.onExportPdf}
            onDelete={handlers.onDelete}
            onDeleteMany={handlers.onDeleteMany}
            onReevaluate={handlers.onReevaluate}
            onReevaluateMany={handlers.onReevaluateMany}
            hasActiveJd={Boolean(control.useJd && control.jd.trim())}
          />
        </section>
      )}
    </div>
  );
}

function StatPill({
  value,
  label,
  tone = "text-foreground",
}: {
  value: number | string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="py-1">
      <p className={`font-mono text-base ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusDot({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    queued: "bg-muted-foreground/40",
    extracting: "bg-primary animate-pulse",
    analyzing: "bg-primary animate-pulse",
    retrying: "bg-warning animate-pulse",
    done: "bg-success",
    error: "bg-destructive",
    cancelled: "bg-muted-foreground",
  };
  return <span className={`size-2.5 shrink-0 rounded-full ${map[status]}`} />;
}
