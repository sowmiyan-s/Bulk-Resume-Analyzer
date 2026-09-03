import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  Filter,
  KeyRound,
  Layers,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Square,
  Trash,
  Trash2,
  Unlock,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAdminSettingsFn,
  saveAdminSettingsFn,
  verifyAdminPassFn,
  clearAnalysesMongoFn,
  loadAnalysesMongoFn,
  deleteAnalysisMongoFn,
  deleteManyAnalysesMongoFn,
  restoreAnalysisMongoFn,
  restoreManyAnalysesMongoFn,
  purgeDeletedAnalysesMongoFn,
  testApiKeyFn,
  type StoredMongoAnalysis,
} from "@/lib/database.server";
import { effectiveScore, tierTone } from "@/lib/analysis-types";
import { modelsByProvider, PROVIDER_LABEL, type ProviderId } from "@/lib/models";
import { exportCsv } from "@/lib/report";
import { loadSettings, saveSettings } from "@/lib/settings";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Portal — Resume Radiance" },
      {
        name: "description",
        content: "System settings, API key vault, resume history archive, and MongoDB database management.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [passcode, setPasscode] = useState("");
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(false);

  // Vault state
  const [qwenKey, setQwenKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [cerebrasKey, setCerebrasKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [nvidiaKey, setNvidiaKey] = useState("");
  const [defaultRole, setDefaultRole] = useState("Software Engineer (Entry Level)");
  const [defaultJd, setDefaultJd] = useState("");
  const [companyName, setCompanyName] = useState("the hiring company");
  const [defaultModelId, setDefaultModelId] = useState("llama-3.3-70b-versatile");
  const [showKey, setShowKey] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingQwen, setTestingQwen] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingCerebras, setTestingCerebras] = useState(false);
  const [testingOpenRouter, setTestingOpenRouter] = useState(false);
  const [testingNvidia, setTestingNvidia] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);

  // Stats & Resume History state
  const [analyses, setAnalyses] = useState<StoredMongoAnalysis[]>([]);
  const [mongoStatus, setMongoStatus] = useState<{
    ok: boolean;
    message: string;
    dbName: string;
    latencyMs?: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "deleted">("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "score-desc" | "score-asc" | "name">("date-desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRecord, setSelectedRecord] = useState<StoredMongoAnalysis | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "clean_text" | "raw_text" | "json">("overview");
  const [copiedText, setCopiedText] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async (pass: string) => {
    try {
      const res = await getAdminSettingsFn({ data: { passcode: pass } });
      if (res.success && res.settings) {
        setQwenKey(res.settings.qwenApiKey || "");
        setGroqKey(res.settings.groqApiKey || "");
        setCerebrasKey(res.settings.cerebrasApiKey || "");
        setOpenrouterKey(res.settings.openrouterApiKey || "");
        setNvidiaKey(res.settings.nvidiaApiKey || "");
        setGeminiKey(res.settings.geminiApiKey || "");
        setDefaultRole(res.settings.defaultRole || "Software Engineer (Entry Level)");
        setDefaultJd(res.settings.defaultJd || "");
        setCompanyName(res.settings.companyName || "the hiring company");
        if (res.settings.defaultModelId) {
          setDefaultModelId(res.settings.defaultModelId);
        }
        if (res.stats?.mongoPing) {
          setMongoStatus(res.stats.mongoPing);
        }
      }

      // Load full history (including deleted records) for Admin review
      const listRes = await loadAnalysesMongoFn({ data: { includeDeleted: true } });
      if (listRes.success && listRes.items) {
        setAnalyses(listRes.items as unknown as StoredMongoAnalysis[]);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const verifyAndLoad = useCallback(
    async (pass: string) => {
      setLoading(true);
      try {
        const res = await verifyAdminPassFn({ data: { passcode: pass } });
        if (res.valid) {
          setIsAuth(true);
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("rr_admin_auth", pass);
          }
          await loadData(pass);
        } else {
          toast.error("Incorrect admin passcode.");
        }
      } catch {
        toast.error("Authentication check failed.");
      } finally {
        setLoading(false);
      }
    },
    [loadData],
  );

  // Check saved session auth
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? window.sessionStorage.getItem("rr_admin_auth") : null;
    if (saved) {
      setPasscode(saved);
      void verifyAndLoad(saved);
    }
  }, [verifyAndLoad]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await saveAdminSettingsFn({
        data: {
          passcode,
          settings: {
            qwenApiKey: qwenKey,
            groqApiKey: groqKey,
            cerebrasApiKey: cerebrasKey,
            openrouterApiKey: openrouterKey,
            nvidiaApiKey: nvidiaKey,
            geminiApiKey: geminiKey,
            defaultRole,
            defaultJd,
            companyName,
            defaultModelId,
          },
        },
      });
      if (res.success) {
        toast.success("API keys & system settings saved to MongoDB Atlas!");
        const current = loadSettings();
        const updated = {
          ...current,
          modelId: defaultModelId,
          defaultRole,
          companyName,
        };
        saveSettings(updated);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("rr:model-changed", { detail: defaultModelId }));
        }
      } else {
        toast.error(res.error || "Failed to save settings.");
      }

    } catch {
      toast.error("Error saving settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestGroq = async () => {
    if (!groqKey.trim()) {
      toast.error("Please enter a Groq API key to test.");
      return;
    }
    setTestingGroq(true);
    try {
      const res = await testApiKeyFn({
        data: { provider: "groq", apiKey: groqKey.trim(), passcode },
      });
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      toast.error(`Test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestingGroq(false);
    }
  };

  const handleTestCerebras = async () => {
    if (!cerebrasKey.trim()) {
      toast.error("Please enter a Cerebras API key to test.");
      return;
    }
    setTestingCerebras(true);
    try {
      const res = await testApiKeyFn({
        data: { provider: "cerebras", apiKey: cerebrasKey.trim(), passcode },
      });
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      toast.error(`Test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestingCerebras(false);
    }
  };

  const handleTestQwen = async () => {
    if (!qwenKey.trim()) {
      toast.error("Please enter a Qwen / Alibaba DashScope API key to test.");
      return;
    }
    setTestingQwen(true);
    try {
      const res = await testApiKeyFn({
        data: { provider: "qwen", apiKey: qwenKey.trim(), passcode },
      });
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      toast.error(`Test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestingQwen(false);
    }
  };

  const handleTestOpenRouter = async () => {
    if (!openrouterKey.trim()) {
      toast.error("Please enter an OpenRouter API key to test.");
      return;
    }
    setTestingOpenRouter(true);
    try {
      const res = await testApiKeyFn({
        data: { provider: "openrouter", apiKey: openrouterKey.trim(), passcode },
      });
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      toast.error(`Test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestingOpenRouter(false);
    }
  };

  const handleTestNvidia = async () => {
    if (!nvidiaKey.trim()) {
      toast.error("Please enter an NVIDIA API key to test.");
      return;
    }
    setTestingNvidia(true);
    try {
      const res = await testApiKeyFn({
        data: {
          provider: "nvidia",
          apiKey: nvidiaKey.trim(),
          passcode,
        },
      });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Test failed: ${msg}`);
    } finally {
      setTestingNvidia(false);
    }
  };

  const handleTestGemini = async () => {
    if (!geminiKey.trim()) {
      toast.error("Please enter a Gemini API key to test.");
      return;
    }
    setTestingGemini(true);
    try {
      const res = await testApiKeyFn({
        data: {
          provider: "gemini",
          apiKey: geminiKey.trim(),
          passcode,
        },
      });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Test failed: ${msg}`);
    } finally {
      setTestingGemini(false);
    }
  };

  const handleRestoreOne = async (id: string, name: string) => {
    setActionLoading(true);
    try {
      const res = await restoreAnalysisMongoFn({ data: { id, passcode } });
      if (res.success) {
        setAnalyses((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_deleted: false, deleted_at: null } : a)),
        );
        if (selectedRecord?.id === id) {
          setSelectedRecord((prev) => (prev ? { ...prev, is_deleted: false, deleted_at: null } : null));
        }
        toast.success(`Candidate "${name}" restored to Home page.`);
      } else {
        toast.error(res.error || "Failed to restore candidate.");
      }
    } catch {
      toast.error("Failed to restore candidate.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setActionLoading(true);
    try {
      const res = await restoreManyAnalysesMongoFn({ data: { ids, passcode } });
      if (res.success) {
        const idSet = new Set(ids);
        setAnalyses((prev) =>
          prev.map((a) => (idSet.has(a.id) ? { ...a, is_deleted: false, deleted_at: null } : a)),
        );
        setSelectedIds(new Set());
        toast.success(`Restored ${ids.length} candidate record(s) to Home page.`);
      } else {
        toast.error(res.error || "Failed to restore candidates.");
      }
    } catch {
      toast.error("Failed to restore candidates.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOne = async (id: string, name: string, permanent = false) => {
    const promptMsg = permanent
      ? `PERMANENTLY purge record for "${name}" from MongoDB Atlas? This cannot be undone.`
      : `Archive candidate "${name}" (delete from Home page)?`;

    if (!window.confirm(promptMsg)) return;

    setActionLoading(true);
    try {
      const res = await deleteAnalysisMongoFn({ data: { id, passcode, permanent } });
      if (res.success) {
        if (permanent) {
          setAnalyses((prev) => prev.filter((a) => a.id !== id));
          if (selectedRecord?.id === id) setSelectedRecord(null);
          toast.success(`Record for "${name}" permanently purged.`);
        } else {
          const now = new Date().toISOString();
          setAnalyses((prev) =>
            prev.map((a) => (a.id === id ? { ...a, is_deleted: true, deleted_at: now } : a)),
          );
          if (selectedRecord?.id === id) {
            setSelectedRecord((prev) => (prev ? { ...prev, is_deleted: true, deleted_at: now } : null));
          }
          toast.success(`Candidate "${name}" archived from Home page.`);
        }
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        toast.error(res.error || "Failed to delete record.");
      }
    } catch {
      toast.error("Failed to delete record.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSelected = async (permanent = false) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const promptMsg = permanent
      ? `PERMANENTLY PURGE ${ids.length} selected record(s) from MongoDB Atlas? This CANNOT be undone.`
      : `Archive ${ids.length} selected candidate(s) from the Home page?`;

    if (!window.confirm(promptMsg)) return;

    setActionLoading(true);
    try {
      const res = await deleteManyAnalysesMongoFn({ data: { ids, passcode, permanent } });
      if (res.success) {
        const idSet = new Set(ids);
        if (permanent) {
          setAnalyses((prev) => prev.filter((a) => !idSet.has(a.id)));
          if (selectedRecord && idSet.has(selectedRecord.id)) setSelectedRecord(null);
          toast.success(`Permanently purged ${ids.length} record(s).`);
        } else {
          const now = new Date().toISOString();
          setAnalyses((prev) =>
            prev.map((a) => (idSet.has(a.id) ? { ...a, is_deleted: true, deleted_at: now } : a)),
          );
          toast.success(`Archived ${ids.length} record(s) from Home page.`);
        }
        setSelectedIds(new Set());
      } else {
        toast.error(res.error || "Failed to delete selected records.");
      }
    } catch {
      toast.error("Failed to delete records.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePurgeAllDeleted = async () => {
    const delCount = analyses.filter((a) => a.is_deleted).length;
    if (delCount === 0) {
      toast.info("No deleted records to purge.");
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to PERMANENTLY purge all ${delCount} deleted records from MongoDB Atlas? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await purgeDeletedAnalysesMongoFn({ data: { passcode } });
      if (res.success) {
        setAnalyses((prev) => prev.filter((a) => !a.is_deleted));
        if (selectedRecord?.is_deleted) setSelectedRecord(null);
        setSelectedIds(new Set());
        toast.success(res.message || "All deleted records permanently purged.");
      } else {
        toast.error(res.error || "Failed to purge deleted records.");
      }
    } catch {
      toast.error("Failed to purge deleted records.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    if (
      !window.confirm(
        "⚠️ MASTER DATABASE PURGE: Are you sure you want to PERMANENTLY wipe ALL candidate records in MongoDB Atlas? This CANNOT be undone.",
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await clearAnalysesMongoFn({ data: { passcode, permanent: true } });
      if (res.success) {
        setAnalyses([]);
        setSelectedRecord(null);
        setSelectedIds(new Set());
        toast.success("All candidate records permanently wiped from MongoDB Atlas.");
      } else {
        toast.error(res.error || "Failed to clear records.");
      }
    } catch {
      toast.error("Failed to clear records.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportFiltered = async () => {
    if (!filteredAnalyses.length) {
      toast.error("No records to export.");
      return;
    }
    await exportCsv(
      filteredAnalyses.map((a) => ({
        fileName: a.file_name,
        analysis: a.analysis,
      })),
      `mongodb-resume-history-${statusFilter}-${Date.now()}.csv`,
    );
    toast.success(`Exported ${filteredAnalyses.length} candidate(s) to CSV.`);
  };

  const handleExportSelected = async () => {
    const selected = filteredAnalyses.filter((a) => selectedIds.has(a.id));
    if (!selected.length) {
      toast.error("No records selected.");
      return;
    }
    await exportCsv(
      selected.map((a) => ({
        fileName: a.file_name,
        analysis: a.analysis,
      })),
      `mongodb-resume-history-selected-${Date.now()}.csv`,
    );
    toast.success(`Exported ${selected.length} selected candidate(s) to CSV.`);
  };

  const totalCount = analyses.length;
  const activeCount = analyses.filter((a) => !a.is_deleted).length;
  const deletedCount = analyses.filter((a) => a.is_deleted).length;
  const avgScore =
    totalCount > 0
      ? Math.round(
          analyses.reduce(
            (acc, a) => acc + (a.analysis ? effectiveScore(a.analysis) : a.overall_score),
            0,
          ) / totalCount,
        )
      : 0;

  const filteredAnalyses = useMemo(() => {
    return analyses
      .filter((a) => {
        // Status filter
        if (statusFilter === "active" && a.is_deleted) return false;
        if (statusFilter === "deleted" && !a.is_deleted) return false;

        // Tier filter
        if (tierFilter !== "all" && a.readiness_tier !== tierFilter) return false;

        // Search query
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          a.candidate_name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          a.file_name.toLowerCase().includes(q) ||
          (a.analysis?.skillMatrix?.matched || []).some((s) => s.toLowerCase().includes(q)) ||
          (a.analysis?.skillMatrix?.recommended || []).some((s) => s.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const scoreA = a.analysis ? effectiveScore(a.analysis) : a.overall_score;
        const scoreB = b.analysis ? effectiveScore(b.analysis) : b.overall_score;
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();

        if (sortBy === "date-desc") return dateB - dateA;
        if (sortBy === "date-asc") return dateA - dateB;
        if (sortBy === "score-desc") return scoreB - scoreA;
        if (sortBy === "score-asc") return scoreA - scoreB;
        if (sortBy === "name") return a.candidate_name.localeCompare(b.candidate_name);
        return 0;
      });
  }, [analyses, query, statusFilter, tierFilter, sortBy]);

  // Login Screen
  if (!isAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-8 shadow-2xl">
          <div className="text-center space-y-2">
            <img
              src="/favicon.png"
              alt="College Logo"
              className="mx-auto size-20 object-contain drop-shadow-sm"
            />
            <h1 className="text-xl font-bold tracking-tight text-foreground">Admin Portal</h1>
            <p className="text-xs text-muted-foreground">
              Enter your admin passcode to access system settings and the MongoDB API vault.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verifyAndLoad(passcode);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="admin-pass" className="text-xs">
                Passcode
              </Label>
              <div className="relative">
                <Input
                  id="admin-pass"
                  type="password"
                  value={passcode}
                  placeholder="Enter passcode..."
                  onChange={(e) => setPasscode(e.target.value)}
                  className="pr-10 text-xs font-mono"
                  autoFocus
                />
                <Lock className="absolute right-3 top-2.5 size-4 text-muted-foreground" />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !passcode.trim()}
              className="w-full text-xs font-semibold"
            >
              {loading ? (
                <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Unlock className="size-3.5 mr-1.5" />
              )}
              Authenticate
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ArrowLeft className="size-3" /> Back to Console
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg px-2.5 py-1.5 border border-border bg-secondary/50"
            >
              <ArrowLeft className="size-3.5" /> Back to App
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <span className="text-sm font-bold tracking-tight">
                System Admin &amp; Cloud Vault
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium"
              onClick={() => void loadData(passcode)}
            >
              <RefreshCw className="size-3 mr-1.5" /> Refresh Data
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setIsAuth(false);
                if (typeof window !== "undefined")
                  window.sessionStorage.removeItem("rr_admin_auth");
              }}
            >
              Lock
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-8">
        {/* Section 1: MongoDB Database Status & Archive Overview */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`flex size-9 items-center justify-center rounded-xl ${mongoStatus?.ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                <Database className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold">MongoDB Atlas Cloud Cluster</h2>
                <p className="text-xs text-muted-foreground">
                  DB: {mongoStatus?.dbName || "resume_radiance"} {mongoStatus?.latencyMs !== undefined ? `· Latency: ${mongoStatus.latencyMs}ms` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                mongoStatus?.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}>
                <span className={`size-1.5 rounded-full ${mongoStatus?.ok ? "bg-success animate-pulse" : "bg-destructive"}`} />
                {mongoStatus?.ok ? `Connected (${mongoStatus.latencyMs ?? 0}ms)` : (mongoStatus?.message || "Disconnected")}
              </span>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-1">
            <div className="rounded-xl border border-border bg-secondary/30 p-3">
              <div className="text-[11px] font-medium text-muted-foreground">Total History in DB</div>
              <div className="text-xl font-bold tracking-tight text-foreground mt-0.5">{totalCount}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">All assessment records</div>
            </div>

            <div className="rounded-xl border border-success/30 bg-success/5 p-3">
              <div className="text-[11px] font-medium text-success">Active on Home</div>
              <div className="text-xl font-bold tracking-tight text-success mt-0.5">{activeCount}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Visible on dashboard</div>
            </div>

            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Deleted from Home</div>
              <div className="text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400 mt-0.5">{deletedCount}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Retained in admin archive</div>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="text-[11px] font-medium text-primary">Average ATS Score</div>
              <div className="text-xl font-bold tracking-tight text-foreground mt-0.5">{avgScore}<span className="text-xs font-normal text-muted-foreground">/100</span></div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Across all candidates</div>
            </div>
          </div>
        </section>

        {/* Section 2: Authoritative Model & Multi-Provider Failover */}
        <section className="rounded-2xl border border-primary/30 bg-card p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Lock className="size-4" />
                </div>
                <h2 className="text-sm font-bold text-foreground">
                  Authoritative AI Screening Model (Admin Only)
                </h2>
                <Badge variant="default" className="text-[10px] font-semibold bg-primary text-primary-foreground">
                  System-Wide Master
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Model selection is strictly controlled in this Admin Portal. All candidates and batch runs across the platform will be evaluated using your selected model below.
              </p>
            </div>

            <Button
              onClick={() => void handleSaveSettings()}
              disabled={savingSettings}
              className="text-xs font-semibold h-9 shrink-0 shadow-sm"
            >
              {savingSettings ? (
                <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Check className="size-3.5 mr-1.5" />
              )}
              Save Model &amp; System Settings
            </Button>
          </div>

          <div className="grid gap-5 sm:grid-cols-3 pt-2">
            <div className="space-y-2">
              <Label htmlFor="def-model" className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Active Primary Screening Model</span>
                <span className="text-[10px] text-primary font-mono font-semibold">MongoDB Atlas</span>
              </Label>
              <Select value={defaultModelId} onValueChange={setDefaultModelId}>
                <SelectTrigger id="def-model" className="text-xs font-medium border-primary/40 bg-secondary/30">
                  <SelectValue placeholder="Select default model" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(Object.keys(modelsByProvider()) as ProviderId[]).map((prov) => {
                    const list = modelsByProvider()[prov];
                    if (!list.length) return null;
                    return (
                      <SelectGroup key={prov}>
                        <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {PROVIDER_LABEL[prov]}
                        </SelectLabel>
                        {list.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              <span>{m.label}</span>
                              {m.tag && (
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-medium">
                                  {m.tag}
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="def-role" className="text-xs font-bold text-foreground">
                Default Target Role Title
              </Label>
              <Input
                id="def-role"
                value={defaultRole}
                placeholder="Software Engineer (Entry Level)"
                onChange={(e) => setDefaultRole(e.target.value)}
                className="text-xs bg-secondary/20"
              />
              <p className="text-[11px] text-muted-foreground">
                Target job title evaluated against when no custom role is specified.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="def-company" className="text-xs font-bold text-foreground">
                Default Hiring Company Name
              </Label>
              <Input
                id="def-company"
                value={companyName}
                placeholder="the hiring company"
                onChange={(e) => setCompanyName(e.target.value)}
                className="text-xs bg-secondary/20"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="def-jd" className="text-xs font-bold text-foreground">
                  Default Job Description (JD) &amp; Requirements
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Optional — Used if no custom JD is pasted on the Home page
                </span>
              </div>
              <Textarea
                id="def-jd"
                value={defaultJd}
                placeholder="Paste default Job Description, core responsibilities, and required stack here... (Leave blank to use Global SDE benchmark)"
                onChange={(e) => setDefaultJd(e.target.value)}
                rows={4}
                className="text-xs font-mono bg-secondary/20 resize-y"
              />
              <p className="text-[11px] text-muted-foreground">
                When resumes are analyzed without entering a custom JD on the Home page, the system will automatically evaluate candidates against this default JD. If left blank, it seamlessly defaults to the <strong className="text-foreground">Global SDE Benchmark</strong>.
              </p>
            </div>
          </div>

          {/* Automatic Multi-Provider Failover Status Banner */}
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                <Zap className="size-3.5 text-warning" /> Automatic Multi-Provider Rate Limit Failover
              </span>
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success text-[10px] font-semibold">
                Cascade Hot-Standby Active
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If the primary model hits an API rate limit (HTTP 429 / 503 or quota ceiling) during 50-resume parallel screening, the engine automatically cascades to the next available provider with a valid key in the vault without failing the analysis:
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-medium ${qwenKey ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground opacity-60"}`}>
                <span className={`size-1.5 rounded-full ${qwenKey ? "bg-success" : "bg-muted-foreground"}`} />
                Qwen DashScope {qwenKey ? "(Ready)" : "(No Key)"}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-medium ${cerebrasKey ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground opacity-60"}`}>
                <span className={`size-1.5 rounded-full ${cerebrasKey ? "bg-success" : "bg-muted-foreground"}`} />
                Cerebras Wafer-Scale {cerebrasKey ? "(Ready)" : "(No Key)"}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-medium ${groqKey ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground opacity-60"}`}>
                <span className={`size-1.5 rounded-full ${groqKey ? "bg-success" : "bg-muted-foreground"}`} />
                Groq Cloud LPU {groqKey ? "(Ready)" : "(No Key)"}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-medium ${geminiKey ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground opacity-60"}`}>
                <span className={`size-1.5 rounded-full ${geminiKey ? "bg-success" : "bg-muted-foreground"}`} />
                Google Gemini {geminiKey ? "(Ready)" : "(No Key)"}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-medium ${openrouterKey ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground opacity-60"}`}>
                <span className={`size-1.5 rounded-full ${openrouterKey ? "bg-success" : "bg-muted-foreground"}`} />
                OpenRouter :free {openrouterKey ? "(Ready)" : "(No Key)"}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-medium ${nvidiaKey ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground opacity-60"}`}>
                <span className={`size-1.5 rounded-full ${nvidiaKey ? "bg-success" : "bg-muted-foreground"}`} />
                NVIDIA NIM {nvidiaKey ? "(Ready)" : "(No Key)"}
              </span>
            </div>
          </div>
        </section>

        {/* Section 3: Secure API Key Vault */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> Server-Side API Key Vault (Stored in
              MongoDB)
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Keys saved here are stored safely in your MongoDB cluster and automatically used by
              the screening engine. Users visiting the app will not need to paste their own keys.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Qwen / Alibaba DashScope */}
            <div className="space-y-2">
              <Label htmlFor="qwen-key" className="text-xs flex items-center justify-between">
                <span>🌟 Qwen Cloud API Key (home.qwencloud.com/benefits)</span>
                {qwenKey && (
                  <span className="text-[10px] text-success font-semibold">Active in MongoDB</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="qwen-key"
                  type={showKey ? "text" : "password"}
                  value={qwenKey}
                  placeholder="sk-..."
                  onChange={(e) => setQwenKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey((v) => !v)}
                  className="shrink-0"
                  aria-label={showKey ? "Hide API Key" : "Show API Key"}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleTestQwen()}
                  disabled={testingQwen || !qwenKey.trim()}
                  className="shrink-0 text-xs px-2.5 h-9"
                  title="Test Qwen Cloud connection"
                >
                  {testingQwen ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5 mr-1 text-primary" />
                  )}
                  Test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center justify-between">
                <span>
                  Claim free 1M–2M tokens benefits at{" "}
                  <a
                    href="https://home.qwencloud.com/benefits"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary font-semibold underline hover:text-primary/80"
                  >
                    home.qwencloud.com/benefits
                  </a>
                </span>
              </p>
            </div>

            {/* Groq Cloud */}
            <div className="space-y-2">
              <Label htmlFor="groq-key" className="text-xs flex items-center justify-between">
                <span>⚡ Groq API Key (100% Free · 14,400/Day)</span>
                {groqKey && (
                  <span className="text-[10px] text-success font-semibold">Active in MongoDB</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="groq-key"
                  type={showKey ? "text" : "password"}
                  value={groqKey}
                  placeholder="gsk_..."
                  onChange={(e) => setGroqKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey((v) => !v)}
                  className="shrink-0"
                  aria-label={showKey ? "Hide API Key" : "Show API Key"}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleTestGroq()}
                  disabled={testingGroq || !groqKey.trim()}
                  className="shrink-0 text-xs px-2.5 h-9"
                  title="Test Groq Cloud connection"
                >
                  {testingGroq ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5 mr-1 text-primary" />
                  )}
                  Test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Free permanent key from console.groq.com (30 RPM · 500+ tok/s)
              </p>
            </div>

            {/* Cerebras */}
            <div className="space-y-2">
              <Label htmlFor="cerebras-key" className="text-xs flex items-center justify-between">
                <span>🚀 Cerebras API Key (100% Free · 1,800 tok/s)</span>
                {cerebrasKey && (
                  <span className="text-[10px] text-success font-semibold">Active in MongoDB</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="cerebras-key"
                  type={showKey ? "text" : "password"}
                  value={cerebrasKey}
                  placeholder="csk-..."
                  onChange={(e) => setCerebrasKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleTestCerebras()}
                  disabled={testingCerebras || !cerebrasKey.trim()}
                  className="shrink-0 text-xs px-2.5 h-9"
                  title="Test Cerebras Wafer-Scale connection"
                >
                  {testingCerebras ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5 mr-1 text-primary" />
                  )}
                  Test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Free wafer-scale key from cloud.cerebras.ai (World's fastest)
              </p>
            </div>

            {/* Google Gemini */}
            <div className="space-y-2">
              <Label htmlFor="gemini-key" className="text-xs flex items-center justify-between">
                <span>🌐 Google Gemini API Key (100% Free · 1,500/Day)</span>
                {geminiKey && (
                  <span className="text-[10px] text-success font-semibold">Active in MongoDB</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="gemini-key"
                  type={showKey ? "text" : "password"}
                  value={geminiKey}
                  placeholder="AIza..."
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleTestGemini()}
                  disabled={testingGemini || !geminiKey.trim()}
                  className="shrink-0 text-xs px-2.5 h-9"
                  title="Test Google Gemini connection"
                >
                  {testingGemini ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5 mr-1 text-primary" />
                  )}
                  Test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Free permanent key from aistudio.google.com (15 RPM · 1M context)
              </p>
            </div>

            {/* NVIDIA NIM */}
            <div className="space-y-2">
              <Label htmlFor="nvidia-key" className="text-xs flex items-center justify-between">
                <span>🟢 NVIDIA NIM API Key (1,000 Free Credits)</span>
                {nvidiaKey && (
                  <span className="text-[10px] text-success font-semibold">Active in MongoDB</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="nvidia-key"
                  type={showKey ? "text" : "password"}
                  value={nvidiaKey}
                  placeholder="nvapi-..."
                  onChange={(e) => setNvidiaKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleTestNvidia()}
                  disabled={testingNvidia || !nvidiaKey.trim()}
                  className="shrink-0 text-xs px-2.5 h-9"
                  title="Test NVIDIA NIM connection"
                >
                  {testingNvidia ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5 mr-1 text-primary" />
                  )}
                  Test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Free API key from build.nvidia.com
              </p>
            </div>

            {/* OpenRouter Free Models */}
            <div className="space-y-2">
              <Label htmlFor="openrouter-key" className="text-xs flex items-center justify-between">
                <span>🔀 OpenRouter API Key (Permanent Free :free models)</span>
                {openrouterKey && (
                  <span className="text-[10px] text-success font-semibold">Active in MongoDB</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="openrouter-key"
                  type={showKey ? "text" : "password"}
                  value={openrouterKey}
                  placeholder="sk-or-v1-..."
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleTestOpenRouter()}
                  disabled={testingOpenRouter || !openrouterKey.trim()}
                  className="shrink-0 text-xs px-2.5 h-9"
                  title="Test OpenRouter connection"
                >
                  {testingOpenRouter ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5 mr-1 text-primary" />
                  )}
                  Test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Free permanent key from openrouter.ai (Access to DeepSeek R1, Llama 3.3, Qwen)
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => void handleSaveSettings()}
              disabled={savingSettings}
              className="text-xs font-semibold h-9"
            >
              {savingSettings ? (
                <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Check className="size-3.5 mr-1.5" />
              )}
              Save Vault &amp; System Settings
            </Button>
          </div>
        </section>


        {/* Section 3: MongoDB Resume History & Candidate Archive Hub */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Cpu className="size-4 text-primary" /> Resume History &amp; Cloud Candidate Archive
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Authoritative MongoDB cloud storage. All assessed resumes—including those removed from the Home page—remain securely archived here with complete details.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => void handleExportFiltered()}
                disabled={actionLoading || filteredAnalyses.length === 0}
              >
                <Download className="size-3 mr-1.5" /> Export CSV ({filteredAnalyses.length})
              </Button>

              {deletedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                  onClick={() => void handlePurgeAllDeleted()}
                  disabled={actionLoading}
                  title="Permanently remove all soft-deleted records from MongoDB Atlas"
                >
                  <Trash className="size-3 mr-1.5" /> Purge {deletedCount} Deleted
                </Button>
              )}

              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => void handleClearDatabase()}
                disabled={actionLoading || totalCount === 0}
                title="Master database wipe (irreversible)"
              >
                <Trash2 className="size-3 mr-1.5" /> Master Wipe DB
              </Button>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-secondary/50 border border-border text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  statusFilter === "all"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All History ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  statusFilter === "active"
                    ? "bg-background text-success shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="size-1.5 rounded-full bg-success" />
                Active ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("deleted")}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  statusFilter === "deleted"
                    ? "bg-background text-rose-600 dark:text-rose-400 shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="size-1.5 rounded-full bg-rose-500" />
                Deleted in Home ({deletedCount})
              </button>
            </div>

            {/* Search, Tier & Sort Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] sm:min-w-[240px]">
                <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search candidate, role, file..."
                  className="pl-8 text-xs h-8"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Tier Filter */}
              <Select value={tierFilter} onValueChange={(val) => setTierFilter(val)}>
                <SelectTrigger className="h-8 text-xs w-[160px]">
                  <SelectValue placeholder="All Tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Readiness Tiers</SelectItem>
                  <SelectItem value="Tier 1: Interview Ready">Tier 1: Interview Ready</SelectItem>
                  <SelectItem value="Tier 2: Conditional Match">Tier 2: Conditional</SelectItem>
                  <SelectItem value="Tier 3: Overhaul Required">Tier 3: Overhaul</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort By */}
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="h-8 text-xs w-[150px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Newest Evaluated</SelectItem>
                  <SelectItem value="date-asc">Oldest Evaluated</SelectItem>
                  <SelectItem value="score-desc">Highest Score</SelectItem>
                  <SelectItem value="score-asc">Lowest Score</SelectItem>
                  <SelectItem value="name">Candidate Name (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk Selection Bar */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-primary/10 border border-primary/25">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <CheckSquare className="size-4" />
                <span>{selectedIds.size} candidate(s) selected</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs font-medium border-success/40 bg-success/10 text-success hover:bg-success/20"
                  onClick={() => void handleRestoreSelected()}
                  disabled={actionLoading}
                >
                  <RotateCcw className="size-3 mr-1" /> Restore to Home
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs font-medium"
                  onClick={() => void handleExportSelected()}
                >
                  <Download className="size-3 mr-1" /> Export Selected CSV
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs font-medium"
                  onClick={() => void handleDeleteSelected(true)}
                  disabled={actionLoading}
                >
                  <Trash2 className="size-3 mr-1" /> Purge Permanently
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Deselect All
                </Button>
              </div>
            </div>
          )}

          {/* History Data Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto w-full">
              <Table className="w-full min-w-[800px]">
              <TableHeader className="bg-secondary/40">
                <TableRow>
                  <TableHead className="w-10 px-3">
                    <Checkbox
                      checked={
                        filteredAnalyses.length > 0 &&
                        filteredAnalyses.every((a) => selectedIds.has(a.id))
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedIds(new Set(filteredAnalyses.map((a) => a.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      aria-label="Select all visible candidates"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-bold">Candidate &amp; File</TableHead>
                  <TableHead className="text-xs font-bold">Status</TableHead>
                  <TableHead className="text-xs font-bold">Role</TableHead>
                  <TableHead className="text-xs font-bold">Score</TableHead>
                  <TableHead className="text-xs font-bold">Readiness Tier</TableHead>
                  <TableHead className="text-xs font-bold">Evaluated Date</TableHead>
                  <TableHead className="text-xs font-bold text-right w-36">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAnalyses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-12 text-center text-xs text-muted-foreground"
                    >
                      <div className="max-w-xs mx-auto space-y-1">
                        <Database className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                        <div className="font-semibold text-foreground">No candidate records found</div>
                        <p className="text-[11px] text-muted-foreground">
                          {query || statusFilter !== "all" || tierFilter !== "all"
                            ? "Try adjusting your search or filter parameters."
                            : "Analyzed candidates will automatically synchronize and archive into MongoDB Atlas."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAnalyses.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    const isDel = Boolean(item.is_deleted);
                    const scoreVal = item.analysis
                      ? effectiveScore(item.analysis)
                      : item.overall_score;

                    return (
                      <TableRow
                        key={item.id}
                        className={`hover:bg-secondary/20 transition-colors ${
                          isDel ? "bg-rose-500/[0.02]" : ""
                        } ${isSelected ? "bg-primary/5" : ""}`}
                      >
                        <TableCell className="px-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              });
                            }}
                            aria-label={`Select ${item.candidate_name}`}
                          />
                        </TableCell>

                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(item)}
                            className="text-left font-semibold text-xs text-foreground hover:text-primary transition-colors flex flex-col group"
                          >
                            <span className="group-hover:underline flex items-center gap-1">
                              {item.candidate_name}
                              <Eye className="size-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                              {item.file_name}
                            </span>
                          </button>
                        </TableCell>

                        <TableCell>
                          {isDel ? (
                            <Badge
                              variant="outline"
                              className="border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-semibold"
                              title={
                                item.deleted_at
                                  ? `Removed from Home on: ${new Date(item.deleted_at).toLocaleString()}`
                                  : "Deleted from Home page"
                              }
                            >
                              <Trash2 className="size-2.5 mr-1" /> Deleted in Home
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-success/40 bg-success/10 text-success text-[10px] font-semibold"
                            >
                              <Check className="size-2.5 mr-1" /> Active on Home
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                          {item.role || "—"}
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span
                              className={`font-mono text-xs font-bold ${
                                scoreVal >= 80
                                  ? "text-success"
                                  : scoreVal >= 60
                                  ? "text-amber-500"
                                  : "text-destructive"
                              }`}
                            >
                              {scoreVal}
                            </span>
                            <span className="text-[10px] text-muted-foreground">/100</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${tierTone(item.readiness_tier)}`}
                          >
                            {item.readiness_tier}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-xs font-mono text-muted-foreground">
                          <div>{new Date(item.created_at).toLocaleDateString()}</div>
                          {isDel && item.deleted_at && (
                            <div className="text-[10px] text-rose-500/80">
                              del: {new Date(item.deleted_at).toLocaleDateString()}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Inspect Full Details Button */}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={() => setSelectedRecord(item)}
                              title="Inspect full candidate assessment details"
                            >
                              <Eye className="size-3.5" />
                            </Button>

                            {/* Restore to Home Button (if deleted) */}
                            {isDel ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 rounded-lg text-success hover:text-success hover:bg-success/10"
                                onClick={() => void handleRestoreOne(item.id, item.candidate_name)}
                                title={`Restore "${item.candidate_name}" back to Home page`}
                                disabled={actionLoading}
                              >
                                <RotateCcw className="size-3.5" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                                onClick={() => void handleDeleteOne(item.id, item.candidate_name, false)}
                                title={`Archive "${item.candidate_name}" from Home page`}
                                disabled={actionLoading}
                              >
                                <X className="size-3.5" />
                              </Button>
                            )}

                            {/* Permanent Purge Button */}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => void handleDeleteOne(item.id, item.candidate_name, true)}
                              title={`Permanently purge record for "${item.candidate_name}" from MongoDB Atlas`}
                              disabled={actionLoading}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </section>

        {/* Candidate Detail Inspection Dialog */}
        <Dialog open={Boolean(selectedRecord)} onOpenChange={(open) => !open && setSelectedRecord(null)}>
          <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl">
            {selectedRecord && (
              <>
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-border bg-secondary/20">
                  <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
                    <div>
                      <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                        {selectedRecord.candidate_name}
                        {selectedRecord.is_deleted ? (
                          <Badge
                            variant="outline"
                            className="border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px]"
                          >
                            Deleted in Home
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-success/40 bg-success/10 text-success text-[10px]"
                          >
                            Active on Home
                          </Badge>
                        )}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2">
                        <span>Role: <strong className="text-foreground">{selectedRecord.role}</strong></span>
                        <span>•</span>
                        <span className="font-mono text-[11px]">{selectedRecord.file_name}</span>
                        <span>•</span>
                        <span>Evaluated: {new Date(selectedRecord.created_at).toLocaleString()}</span>
                      </DialogDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground font-medium">ATS Score</div>
                        <div className="font-mono text-lg font-bold text-primary">
                          {selectedRecord.analysis
                            ? effectiveScore(selectedRecord.analysis)
                            : selectedRecord.overall_score}
                          <span className="text-xs font-normal text-muted-foreground">/100</span>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold ${tierTone(selectedRecord.readiness_tier)}`}
                      >
                        {selectedRecord.readiness_tier}
                      </Badge>
                    </div>
                  </div>

                  {/* Tabs Header */}
                  <div className="pt-3">
                    <Tabs value={detailTab} onValueChange={(v: any) => setDetailTab(v)}>
                      <TabsList className="h-8 bg-secondary/60">
                        <TabsTrigger value="overview" className="text-xs px-3">
                          Overview &amp; Analysis
                        </TabsTrigger>
                        <TabsTrigger value="clean_text" className="text-xs px-3">
                          Extracted Clean Text
                        </TabsTrigger>
                        <TabsTrigger value="raw_text" className="text-xs px-3">
                          Raw Resume Text
                        </TabsTrigger>
                        <TabsTrigger value="json" className="text-xs px-3">
                          JSON Schema
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </DialogHeader>

                {/* Tab Contents */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {detailTab === "overview" && (
                    <div className="space-y-4 text-xs">
                      {/* HR Verdict & Impression */}
                      {(selectedRecord.analysis?.hrVerdict || selectedRecord.analysis?.recruiterFirstImpression) && (
                        <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
                          {selectedRecord.analysis.hrVerdict && (
                            <div>
                              <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                                <Sparkles className="size-3.5 text-primary" /> Recruiter Evaluation &amp; Verdict
                              </h4>
                              <p className="text-muted-foreground leading-relaxed mt-1">
                                {selectedRecord.analysis.hrVerdict}
                              </p>
                            </div>
                          )}

                          {selectedRecord.analysis.recruiterFirstImpression && (
                            <div className="pt-2 border-t border-border/50">
                              <span className="font-medium text-foreground">First Impression: </span>
                              <span className="text-muted-foreground">{selectedRecord.analysis.recruiterFirstImpression}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Strengths */}
                      {selectedRecord.analysis?.strengths && selectedRecord.analysis.strengths.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                            <Check className="size-3.5 text-success" /> Key Strengths ({selectedRecord.analysis.strengths.length})
                          </h4>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedRecord.analysis.strengths.map((st, i) => (
                              <li
                                key={i}
                                className="rounded-lg border border-success/20 bg-success/5 p-2.5 text-muted-foreground flex items-start gap-2"
                              >
                                <span className="size-1.5 rounded-full bg-success mt-1.5 shrink-0" />
                                <span>{st}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Critical Issues & Mistakes */}
                      {selectedRecord.analysis?.criticalIssues && selectedRecord.analysis.criticalIssues.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                            <Trash2 className="size-3.5 text-destructive" /> Critical Issues &amp; Fixes ({selectedRecord.analysis.criticalIssues.length})
                          </h4>
                          <div className="space-y-2">
                            {selectedRecord.analysis.criticalIssues.map((issue, i) => (
                              <div
                                key={i}
                                className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-foreground">{issue.problem}</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] uppercase font-bold tracking-wider ${
                                      issue.severity === "critical"
                                        ? "border-destructive text-destructive bg-destructive/10"
                                        : "border-amber-500 text-amber-600 bg-amber-500/10"
                                    }`}
                                  >
                                    {issue.severity}
                                  </Badge>
                                </div>
                                {issue.evidence && (
                                  <div className="text-[11px] text-muted-foreground font-mono bg-background/50 p-1.5 rounded border border-border/50">
                                    Evidence: {issue.evidence}
                                  </div>
                                )}
                                {issue.fix && (
                                  <div className="text-[11px] text-success">
                                    <strong className="text-foreground">Recommended Fix:</strong> {issue.fix}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Skill Matrix */}
                      {selectedRecord.analysis?.skillMatrix && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                            <Layers className="size-3.5 text-primary" /> Skills Assessment Matrix
                          </h4>
                          <div className="rounded-xl border border-border p-3 space-y-3">
                            {selectedRecord.analysis.skillMatrix.matched?.length ? (
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-success mb-1">
                                  Matched Competencies ({selectedRecord.analysis.skillMatrix.matched.length})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedRecord.analysis.skillMatrix.matched.map((sk, i) => (
                                    <Badge key={i} variant="secondary" className="text-[11px] font-normal border-success/30 bg-success/10 text-success">
                                      {sk}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {selectedRecord.analysis.skillMatrix.missing?.length ? (
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-destructive mb-1">
                                  Missing / Critical Skill Gaps ({selectedRecord.analysis.skillMatrix.missing.length})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedRecord.analysis.skillMatrix.missing.map((sk, i) => (
                                    <Badge key={i} variant="outline" className="text-[11px] font-normal border-destructive/40 bg-destructive/5 text-destructive">
                                      {sk}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {selectedRecord.analysis.skillMatrix.recommended?.length ? (
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">
                                  Recommended Next Skills ({selectedRecord.analysis.skillMatrix.recommended.length})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedRecord.analysis.skillMatrix.recommended.map((sk, i) => (
                                    <Badge key={i} variant="outline" className="text-[11px] font-normal border-primary/30 text-foreground">
                                      {sk}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {/* Score Breakdown */}
                      {selectedRecord.analysis?.scoreBreakdown && selectedRecord.analysis.scoreBreakdown.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                            <UserCheck className="size-3.5 text-primary" /> Category Scoring Breakdown
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedRecord.analysis.scoreBreakdown.map((row, i) => (
                              <div key={i} className="rounded-xl border border-border bg-secondary/20 p-2.5 flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-foreground">{row.category}</div>
                                  {row.note && <div className="text-[10px] text-muted-foreground">{row.note}</div>}
                                </div>
                                <span className="font-mono font-bold text-xs">
                                  {row.score}/{row.max}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === "clean_text" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Sanitized plain text extracted from candidate resume document</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            if (selectedRecord.clean_text) {
                              void navigator.clipboard.writeText(selectedRecord.clean_text);
                              setCopiedText(true);
                              toast.success("Extracted text copied to clipboard!");
                              setTimeout(() => setCopiedText(false), 2000);
                            }
                          }}
                        >
                          {copiedText ? <Check className="size-3 mr-1 text-success" /> : <Copy className="size-3 mr-1" />}
                          {copiedText ? "Copied" : "Copy Text"}
                        </Button>
                      </div>
                      <div className="rounded-xl border border-border bg-secondary/20 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">
                        {selectedRecord.clean_text || "No clean text stored."}
                      </div>
                    </div>
                  )}

                  {detailTab === "raw_text" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Raw raw document text as extracted before sanitization</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            if (selectedRecord.raw_text) {
                              void navigator.clipboard.writeText(selectedRecord.raw_text);
                              toast.success("Raw text copied to clipboard!");
                            }
                          }}
                        >
                          <Copy className="size-3 mr-1" /> Copy Raw Text
                        </Button>
                      </div>
                      <div className="rounded-xl border border-border bg-secondary/20 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">
                        {selectedRecord.raw_text || "No raw text stored."}
                      </div>
                    </div>
                  )}

                  {detailTab === "json" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Complete MongoDB JSON schema payload</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            void navigator.clipboard.writeText(JSON.stringify(selectedRecord, null, 2));
                            toast.success("JSON copied to clipboard!");
                          }}
                        >
                          <Copy className="size-3 mr-1" /> Copy JSON
                        </Button>
                      </div>
                      <pre className="rounded-xl border border-border bg-secondary/20 p-4 font-mono text-[11px] leading-relaxed max-h-[50vh] overflow-y-auto text-muted-foreground">
                        {JSON.stringify(selectedRecord, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Dialog Footer Actions */}
                <DialogFooter className="px-6 py-3 border-t border-border bg-secondary/20 flex items-center justify-between sm:justify-between">
                  <div className="flex items-center gap-2">
                    {selectedRecord.is_deleted ? (
                      <Button
                        size="sm"
                        className="bg-success text-success-foreground hover:bg-success/90 text-xs font-semibold h-8"
                        onClick={() => void handleRestoreOne(selectedRecord.id, selectedRecord.candidate_name)}
                        disabled={actionLoading}
                      >
                        <RotateCcw className="size-3.5 mr-1.5" /> Restore to Home Page
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs font-semibold h-8 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        onClick={() => void handleDeleteOne(selectedRecord.id, selectedRecord.candidate_name, false)}
                        disabled={actionLoading}
                      >
                        <X className="size-3.5 mr-1.5" /> Archive from Home
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8"
                      onClick={() =>
                        void exportCsv(
                          [
                            {
                              fileName: selectedRecord.file_name,
                              analysis: selectedRecord.analysis,
                            },
                          ],
                          `${selectedRecord.candidate_name.replace(/\s+/g, "_")}-analysis.csv`,
                        )
                      }
                    >
                      <Download className="size-3 mr-1.5" /> Export Candidate CSV
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-8"
                    onClick={() => setSelectedRecord(null)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
