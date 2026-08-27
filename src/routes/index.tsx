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
  Target,
  Trash2,
  Trophy,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Leaderboard } from "@/components/Leaderboard";
import { MasterTable, type MasterRow } from "@/components/MasterTable";
import { RectifyDrawer, type RectifyTarget } from "@/components/RectifyDrawer";
import { SettingsDialog } from "@/components/SettingsDialog";
import { effectiveScore, normalizeAnalysis, createRuleBasedAnalysis, type Analysis } from "@/lib/analysis-types";
import { runAtsEngine, atsFactSheet, type AtsReport } from "@/lib/ats-engine";
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
  hasServerQwenKey?: boolean;
  hasServerGroqKey?: boolean;
  hasServerCerebrasKey?: boolean;
  hasServerOpenRouterKey?: boolean;
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
  const [ruleBasedOnly, setRuleBasedOnly] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [concurrency, setConcurrency] = useState(10);
  const [maxRetries, setMaxRetries] = useState(3);
  const [running, setRunning] = useState(false);
  const [shortlistCutoff, setShortlistCutoff] = useState<number>(75);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const queueRef = useRef<RateLimitedQueue<Analysis> | null>(null);


  const refreshSystemInfo = useCallback(async () => {
    try {
      const info = await getPublicSystemInfoFn();
      if (info) {
        setSystemInfo(info);
        if (info.defaultModelId) {
          setSettings((prev) => {
            if (prev.modelId === info.defaultModelId) return prev;
            return {
              ...prev,
              modelId: info.defaultModelId!,
              defaultRole: info.defaultRole || prev.defaultRole,
              companyName: info.companyName || prev.companyName,
            };
          });
          const m = findModel(info.defaultModelId);
          if (m?.recommendedConcurrency) {
            setConcurrency(m.recommendedConcurrency);
          }
          if (m?.recommendedCooldownSec !== undefined) {
            setCooldownSec(m.recommendedCooldownSec);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Listen for real-time model changes from Admin Panel or Settings
  useEffect(() => {
    const handleModelChange = (e: Event) => {
      const customEv = e as CustomEvent<string>;
      const newModelId = customEv.detail || loadSettings().modelId;
      if (newModelId) {
        setSettings((prev) => {
          if (prev.modelId === newModelId) return prev;
          return { ...prev, modelId: newModelId };
        });
        const m = findModel(newModelId);
        if (m?.recommendedConcurrency) {
          setConcurrency(m.recommendedConcurrency);
        }
        if (m?.recommendedCooldownSec !== undefined) {
          setCooldownSec(m.recommendedCooldownSec);
        }
      }
    };
    window.addEventListener("rr:model-changed", handleModelChange);
    window.addEventListener("storage", handleModelChange);
    return () => {
      window.removeEventListener("rr:model-changed", handleModelChange);
      window.removeEventListener("storage", handleModelChange);
    };
  }, []);

  // Hydrate settings, cloud database analyses, and MongoDB public system info on mount
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    const m = findModel(loaded.modelId);
    if (m?.recommendedConcurrency) {
      setConcurrency(m.recommendedConcurrency);
    }
    if (m?.recommendedCooldownSec !== undefined) {
      setCooldownSec(m.recommendedCooldownSec);
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
    if (m?.recommendedCooldownSec !== undefined) {
      setCooldownSec(m.recommendedCooldownSec);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("rr:model-changed", { detail: next.modelId }));
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

        // High-concurrency pooled pre-extraction: extract up to 10 files in parallel for 50 resumes
        let queueIndex = 0;
        const poolWorker = async () => {
          while (queueIndex < freshItems.length) {
            const item = freshItems[queueIndex++];
            if (!item) break;
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
          }
        };

        const workersCount = Math.min(10, freshItems.length);
        for (let w = 0; w < workersCount; w++) {
          void poolWorker();
        }
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
              `HR Verdict: ${a.hrVerdict}`,
              `Recruiter Impression: ${a.recruiterFirstImpression}`,
              `Matched Skills: ${(a.skillMatrix?.matched || []).join(", ")}`,
              `Missing Skills: ${(a.skillMatrix?.missing || []).join(", ")}`,
              `Recommended Skills: ${(a.skillMatrix?.recommended || []).join(", ")}`,
              `Strengths: ${(a.strengths || []).join("; ")}`,
              `Critical Issues: ${(a.criticalIssues || []).map((ci) => `${ci.area} (${ci.severity}): ${ci.problem} - Fix: ${ci.fix}`).join("; ")}`,
              `Improvement Suggestions: ${(a.techImprovementIdeas || []).join("; ")}`,
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

      // Run deterministic rule-based ATS engine
      const atsReport = runAtsEngine(clean, activeJd);

      if (ruleBasedOnly) {
        return createRuleBasedAnalysis(
          atsReport,
          item.file.name,
          clean,
          activeJd,
          settings.defaultRole,
        );
      }

      const atsFacts = atsFactSheet(atsReport);

      try {
        const raw2 = await callModel(
          {
            fileName: item.file.name,
            resumeText: clean,
            defaultRole: settings.defaultRole,
            companyName: settings.companyName,
            atsFacts,
            ...(activeJd ? { jobDescription: activeJd } : {}),
          },
          settings,
          signal,
        );

        const normalized = normalizeAnalysis(raw2, atsReport);
        // Blend overallScore: 70% ATS engine + 30% LLM audit
        const blendedScore = Math.round(atsReport.score * 0.7 + normalized.overallScore * 0.3);
        normalized.overallScore = Math.max(0, Math.min(100, blendedScore));
        if (atsReport.jdScore !== null) {
          normalized.jdScore = atsReport.jdScore;
        }
        normalized.ats = atsReport;
        return normalized;
      } catch (err: unknown) {
        if (signal?.aborted) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        const isFormatOrJson =
          msg.includes("JSON") || msg.includes("parse") || msg.includes("empty") || attempt >= 2;
        if (isFormatOrJson) {
          console.warn(`[analyzeOne] Model response format issue for ${item.file.name}: ${msg}. Auto-recovering with Deterministic ATS Engine.`);
          return createRuleBasedAnalysis(
            atsReport,
            item.file.name,
            clean,
            activeJd,
            settings.defaultRole,
          );
        }
        throw err;
      } finally {
        clearInterval(timer);
      }
    },
    [patch, settings, useJd, jd, ruleBasedOnly],
  );

  const runBatch = useCallback(() => {
    const activeM = findModel(settings.modelId);
    const hasAnyServerKey =
      Boolean(systemInfo.hasServerNvidiaKey) ||
      Boolean(systemInfo.hasServerGroqKey) ||
      Boolean(systemInfo.hasServerQwenKey) ||
      Boolean(systemInfo.hasServerOpenRouterKey) ||
      Boolean(systemInfo.hasServerCerebrasKey) ||
      Boolean(systemInfo.hasServerGeminiKey);

    const hasKey =
      ruleBasedOnly ||
      activeM.provider === "litellm" ||
      activeM.provider === "openai-compatible" ||
      activeM.provider === "ollama" ||
      Boolean(settings.apiKey.trim()) ||
      Boolean(settings.proxyUrl.trim()) ||
      (activeM.provider === "qwen" && Boolean(systemInfo.hasServerQwenKey)) ||
      (activeM.provider === "groq" && Boolean(systemInfo.hasServerGroqKey)) ||
      (activeM.provider === "cerebras" && Boolean(systemInfo.hasServerCerebrasKey)) ||
      (activeM.provider === "openrouter" && Boolean(systemInfo.hasServerOpenRouterKey)) ||
      (activeM.provider === "nvidia" && Boolean(systemInfo.hasServerNvidiaKey)) ||
      (activeM.provider === "gemini" && Boolean(systemInfo.hasServerGeminiKey)) ||
      hasAnyServerKey;

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
  }, [items, settings, concurrency, cooldownSec, maxRetries, patch, analyzeOne, useJd, jd, ruleBasedOnly, systemInfo]);

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
    const shortlisted = done.filter((i) => effectiveScore(i.analysis!) >= shortlistCutoff).length;
    return {
      total: items.length,
      done: done.length,
      failed: failed.length,
      pending: pending.length,
      retrying: retrying.length,
      avg,
      tier1,
      shortlisted,
      doneRows: done.map((i) => ({ id: i.id, fileName: i.file.name, analysis: i.analysis! })),
    };
  }, [items, shortlistCutoff]);


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
            const merged: Analysis = {
              ...analysis,
              manualScore: prevAnalysis?.manualScore ?? null,
              officerNotes: prevAnalysis?.officerNotes ?? "",
            };
            patch(rid, {
              status: "done",
              progress: 100,
              message: "",
              analysis: merged,
            });
            const item = itemsRef.current.find((i) => i.id === rid);
            void saveAnalysis({
              id: rid,
              fileName: item?.file.name ?? rid,
              analysis: merged,
              cleanText: item?.cleanText,
              rawText: item?.rawText,
            }).catch(() => {});
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
      setItems((prev) => prev.filter((i) => !id || i.id !== id));
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
      const activeJd = useJd && jd.trim() ? jd.trim() : undefined;

      const activeM = findModel(settings.modelId);
      const hasAnyServerKey =
        Boolean(systemInfo.hasServerNvidiaKey) ||
        Boolean(systemInfo.hasServerGroqKey) ||
        Boolean(systemInfo.hasServerQwenKey) ||
        Boolean(systemInfo.hasServerOpenRouterKey) ||
        Boolean(systemInfo.hasServerCerebrasKey) ||
        Boolean(systemInfo.hasServerGeminiKey);

      const hasKey =
        activeM.provider === "litellm" ||
        activeM.provider === "openai-compatible" ||
        activeM.provider === "ollama" ||
        Boolean(settings.apiKey.trim()) ||
        Boolean(settings.proxyUrl.trim()) ||
        (activeM.provider === "qwen" && Boolean(systemInfo.hasServerQwenKey)) ||
        (activeM.provider === "groq" && Boolean(systemInfo.hasServerGroqKey)) ||
        (activeM.provider === "cerebras" && Boolean(systemInfo.hasServerCerebrasKey)) ||
        (activeM.provider === "openrouter" && Boolean(systemInfo.hasServerOpenRouterKey)) ||
        (activeM.provider === "nvidia" && Boolean(systemInfo.hasServerNvidiaKey)) ||
        (activeM.provider === "gemini" && Boolean(systemInfo.hasServerGeminiKey)) ||
        hasAnyServerKey;

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
            ? {
                ...i,
                status: "queued",
                progress: 0,
                message: activeJd ? "Queued for JD re-evaluation…" : "Queued for re-evaluation…",
              }
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
            toast.success(
              activeJd
                ? "Job Description re-evaluation complete."
                : "Re-evaluation complete.",
            );
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
      toast.info(
        activeJd
          ? `Started re-evaluating ${targetItems.length} candidate(s) against current JD.`
          : `Started re-evaluating ${targetItems.length} candidate(s).`,
      );
    },
    [running, jd, useJd, settings, systemInfo, concurrency, cooldownSec, maxRetries, patch, analyzeOne, ruleBasedOnly],
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

  const doExportCsv = useCallback(async (selectedRows?: Array<{ fileName: string; analysis: Analysis }>) => {
    const target = selectedRows && selectedRows.length ? selectedRows : stats.doneRows.map(({ fileName, analysis }) => ({ fileName, analysis }));
    if (!target.length) return;
    try {
      await exportCsv(target);
      toast.success(`CSV with ${target.length} candidate${target.length > 1 ? "s" : ""} downloaded.`);
    } catch (e) {
      toast.error(`CSV export failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }, [stats.doneRows]);

  const doExportMd = useCallback((selectedRows?: Array<{ fileName: string; analysis: Analysis }>) => {
    const target = selectedRows && selectedRows.length ? selectedRows : stats.doneRows.map(({ fileName, analysis }) => ({ fileName, analysis }));
    if (!target.length) return;
    try {
      exportBatchMarkdown(target);
      toast.success(`Markdown report with ${target.length} candidate${target.length > 1 ? "s" : ""} downloaded.`);
    } catch (e) {
      toast.error(`Markdown export failed: ${e instanceof Error ? e.message : "unknown error"}`);
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
              onRetry: runBatch,
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
              onExportMd: () => doExportMd(),
              onExportCsvSelected: doExportCsv,
              onExportMdSelected: doExportMd,
              onOpen: setDrawerId,
              onExportPdf: (id) => void exportPdf(id),
              setDragging,
            }}
            control={{
              useJd,
              setUseJd,
              jd,
              setJd,
              ruleBasedOnly,
              setRuleBasedOnly,
              cooldownSec,
              setCooldownSec,
              concurrency,
              setConcurrency,
              maxRetries,
              setMaxRetries,
              shortlistCutoff,
              setShortlistCutoff,
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
              onExportCsvSelected={doExportCsv}
              onExportMdSelected={doExportMd}
              onDelete={deleteItem}
              onDeleteMany={deleteManyItems}
              onReevaluate={(id) => reanalyzeWithCurrentJd([id])}
              onReevaluateMany={(ids) => reanalyzeWithCurrentJd(ids)}
              hasActiveJd={hasActiveJd}
              shortlistCutoff={shortlistCutoff}
              onShortlistCutoffChange={setShortlistCutoff}
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

/* ----------------------------- Sub-Views & Tabs ---------------------------- */

type Stats = {
  total: number;
  done: number;
  failed: number;
  pending: number;
  retrying: number;
  avg: number;
  tier1: number;
  shortlisted: number;
  doneRows: MasterRow[];
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
    onRetry?: () => void;
    onClear: () => void;
    onDelete?: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
    onReevaluate?: (id: string) => void;
    onReevaluateMany?: (ids: string[]) => void;
    onReevaluateAllJd?: () => void;
    onExportCsv: () => void;
    onExportMd: () => void;
    onExportCsvSelected?: (rows: import("@/components/MasterTable").MasterRow[]) => void;
    onExportMdSelected?: (rows: import("@/components/MasterTable").MasterRow[]) => void;
    onOpen: (id: string) => void;
    onExportPdf: (id: string) => void;
    setDragging: (v: boolean) => void;
  };
  control: {
    useJd: boolean;
    setUseJd: (v: boolean) => void;
    jd: string;
    setJd: (v: string) => void;
    ruleBasedOnly: boolean;
    setRuleBasedOnly: (v: boolean) => void;
    cooldownSec: number;
    setCooldownSec: (v: number) => void;
    concurrency: number;
    setConcurrency: (v: number) => void;
    maxRetries: number;
    setMaxRetries: (v: number) => void;
    shortlistCutoff: number;
    setShortlistCutoff: (v: number) => void;
  };
}) {
  const dragging = useRef(false);
  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Evaluate Resumes in Bulk
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Upload a ZIP of resumes or individual files. Each one is assessed for structure, missing
          information, role relevance and honest, student-improving feedback — then ranked.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-7">
          <label
            aria-label="Upload resume files"
            onDragOver={(e) => {
              e.preventDefault();
              handlers.setDragging(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              handlers.setDragging(true);
            }}
            onDragLeave={() => handlers.setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              handlers.setDragging(false);
              handlers.onFiles(e.dataTransfer.files);
            }}
            className="panel relative flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-border/80 px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-secondary/20"
          >
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.zip"
              className="sr-only"
              onChange={(e) => handlers.onFiles(e.target.files)}
            />
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Upload className="size-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">
              Drop resumes or a <span className="text-primary font-bold">.ZIP archive</span> here, or browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supports bulk PDF, DOCX and nested ZIP files. Text extraction runs entirely in your browser.
            </p>
          </label>

          {/* Job Description (Target Role Match) Accordion Box */}
          <div className="panel space-y-3 p-4 border border-border/80 bg-card/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-primary" />
                <Label htmlFor="jd-toggle" className="text-xs font-semibold text-foreground cursor-pointer">
                  Match Against Target Job Description (JD)
                </Label>
              </div>
              <Switch
                id="jd-toggle"
                checked={control.useJd}
                onCheckedChange={control.setUseJd}
              />
            </div>

            {control.useJd && (
              <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1">
                <p className="text-[11px] text-muted-foreground">
                  Paste the hiring requirements or JD below. The engine will evaluate each candidate's exact fit, missing skills, and calculate a dedicated JD Match %.
                </p>
                <Textarea
                  value={control.jd}
                  onChange={(e) => control.setJd(e.target.value)}
                  placeholder="Paste Job Description, core requirements, and required skills here..."
                  rows={4}
                  className="text-xs font-mono bg-background/50 resize-y"
                />
                {stats.done > 0 && control.jd.trim() && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      JD updated? Re-evaluate previously analyzed resumes:
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs font-semibold rounded-lg bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary"
                      onClick={handlers.onReevaluateAllJd}
                    >
                      <RefreshCw className="size-3 mr-1.5" />
                      Re-evaluate All ({stats.done}) with JD
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4 lg:col-span-5">
          <div className="panel space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-foreground">Screening Engine</h2>
                <p className="text-xs text-muted-foreground">
                  {control.ruleBasedOnly ? "Zero AI · Instant ATS Parser" : `Using ${activeModel.label}`}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {control.ruleBasedOnly ? "100% Local / Free" : "Active Model"}
              </span>
            </div>

            {/* Rule-Based Mode Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center gap-1.5">
                  <Zap className="size-3.5 text-primary fill-primary" />
                  <Label htmlFor="rule-based-mode" className="text-xs font-bold text-foreground cursor-pointer">
                    Rule-Based ATS Engine Only
                  </Label>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Zero AI tokens & instant speed. Scores resumes deterministically using 5-category ATS rules without model calls.
                </p>
              </div>
              <Switch
                id="rule-based-mode"
                checked={control.ruleBasedOnly}
                onCheckedChange={control.setRuleBasedOnly}
              />
            </div>

            {/* Screening Concurrency & Cooldown Tuning */}
            <div className="space-y-3.5 rounded-xl border border-border/80 bg-secondary/20 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Worker Concurrency &amp; Cooldown</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {control.concurrency} worker{control.concurrency > 1 ? "s" : ""} · {control.cooldownSec}s delay
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Parallel Concurrency</span>
                  <span className="font-medium font-mono text-foreground">
                    {control.concurrency} concurrent
                  </span>
                </div>

                {/* Quick Presets for Concurrency */}
                <div className="flex flex-wrap items-center gap-1 pb-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={control.concurrency === 50 ? "default" : "outline"}
                    className="h-5 px-1.5 text-[10px] rounded-md font-mono"
                    disabled={running}
                    onClick={() => {
                      control.setConcurrency(50);
                      control.setCooldownSec(0);
                    }}
                  >
                    50 Turbo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={control.concurrency === 25 ? "default" : "outline"}
                    className="h-5 px-1.5 text-[10px] rounded-md font-mono"
                    disabled={running}
                    onClick={() => {
                      control.setConcurrency(25);
                      control.setCooldownSec(0);
                    }}
                  >
                    25 Fast
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={control.concurrency === 10 ? "default" : "outline"}
                    className="h-5 px-1.5 text-[10px] rounded-md font-mono"
                    disabled={running}
                    onClick={() => {
                      control.setConcurrency(10);
                      control.setCooldownSec(1);
                    }}
                  >
                    10 Balanced
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={control.concurrency === 5 ? "default" : "outline"}
                    className="h-5 px-1.5 text-[10px] rounded-md font-mono"
                    disabled={running}
                    onClick={() => {
                      control.setConcurrency(5);
                      control.setCooldownSec(1);
                    }}
                  >
                    5 Moderate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={control.concurrency === 1 ? "default" : "outline"}
                    className="h-5 px-1.5 text-[10px] rounded-md font-mono"
                    disabled={running}
                    onClick={() => {
                      control.setConcurrency(1);
                      if (activeModel.recommendedCooldownSec !== undefined) {
                        control.setCooldownSec(activeModel.recommendedCooldownSec);
                      }
                    }}
                  >
                    1 Safe
                  </Button>
                </div>

                <Slider
                  value={[control.concurrency]}
                  min={1}
                  max={50}
                  step={1}
                  disabled={running}
                  onValueChange={([v]) => control.setConcurrency(v ?? 1)}
                  className="pt-1.5"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Request Cooldown (Up to 2 min)</span>
                  <span className="font-medium font-mono text-foreground">
                    {control.cooldownSec === 0
                      ? "0s (Instant)"
                      : control.cooldownSec >= 60
                      ? `${Math.floor(control.cooldownSec / 60)}m ${
                          control.cooldownSec % 60 ? `${control.cooldownSec % 60}s` : ""
                        } delay`
                      : `${control.cooldownSec}s delay`}
                  </span>
                </div>

                {/* Quick Presets for Delay up to 2 min */}
                <div className="flex flex-wrap items-center gap-1 pb-1">
                  {[
                    { label: "0s", val: 0 },
                    { label: "3s", val: 3 },
                    { label: "5s", val: 5 },
                    { label: "10s", val: 10 },
                    { label: "30s", val: 30 },
                    { label: "1m", val: 60 },
                    { label: "2m", val: 120 },
                  ].map((p) => (
                    <Button
                      key={p.val}
                      type="button"
                      size="sm"
                      variant={control.cooldownSec === p.val ? "default" : "outline"}
                      className={`h-5 px-1.5 text-[10px] rounded-md font-mono ${
                        control.cooldownSec === p.val
                          ? "bg-primary text-primary-foreground font-bold"
                          : "bg-card/70 text-muted-foreground hover:text-foreground"
                      }`}
                      disabled={running}
                      onClick={() => control.setCooldownSec(p.val)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>

                <Slider
                  value={[control.cooldownSec]}
                  min={0}
                  max={120}
                  step={1}
                  disabled={running}
                  onValueChange={([v]) => control.setCooldownSec(v ?? 0)}
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

            <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-secondary/30 p-2.5 text-center">
              <StatPill label="Total" value={stats.total} />
              <StatPill label="Done" value={stats.done} tone="text-foreground font-bold" />
              <StatPill
                label={`Shortlist (≥${control.shortlistCutoff}%)`}
                value={stats.shortlisted}
                tone="text-emerald-600 dark:text-emerald-400 font-bold"
              />
              <StatPill
                label="Avg Score"
                value={stats.avg > 0 ? stats.avg : "—"}
                tone="text-primary font-bold"
              />
            </div>

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
                      {item.durationMs !== null && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {Math.round(item.durationMs / 1000)}s
                        </span>
                      )}
                    </div>
                    {item.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.message}</p>
                    )}
                  </div>
                  {item.status === "analyzing" && (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  )}
                  {item.status === "extracting" && (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  )}
                  {item.status === "retrying" && (
                    <RotateCcw className="size-4 animate-spin text-warning" />
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      {stats.doneRows.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Candidate Rankings &amp; Audit
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stats.doneRows.length} candidates assessed · {stats.shortlisted} meet shortlist threshold (≥{control.shortlistCutoff}%)
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
            onExportCsvSelected={handlers.onExportCsvSelected}
            onExportMdSelected={handlers.onExportMdSelected}
            onDelete={handlers.onDelete}
            onDeleteMany={handlers.onDeleteMany}
            onReevaluate={handlers.onReevaluate}
            onReevaluateMany={handlers.onReevaluateMany}
            hasActiveJd={Boolean(control.useJd && control.jd.trim())}
            shortlistCutoff={control.shortlistCutoff}
            onShortlistCutoffChange={control.setShortlistCutoff}
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
