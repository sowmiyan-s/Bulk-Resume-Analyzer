import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Cpu,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAdminSettingsFn,
  saveAdminSettingsFn,
  verifyAdminPassFn,
  clearAnalysesMongoFn,
  loadAnalysesMongoFn,
  type StoredMongoAnalysis,
} from "@/lib/database.server";
import { effectiveScore, tierTone } from "@/lib/analysis-types";
import { exportCsv } from "@/lib/report";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Portal — Resume Radiance" },
      {
        name: "description",
        content: "System settings, API key vault, and MongoDB database management.",
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
  const [nvidiaKey, setNvidiaKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [defaultRole, setDefaultRole] = useState("Software Engineer (Entry Level)");
  const [companyName, setCompanyName] = useState("the hiring company");
  const [showKey, setShowKey] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Stats & analyses
  const [analyses, setAnalyses] = useState<StoredMongoAnalysis[]>([]);
  const [mongoStatus, setMongoStatus] = useState<{
    ok: boolean;
    message: string;
    dbName: string;
  } | null>(null);
  const [query, setQuery] = useState("");

  const loadData = useCallback(async (pass: string) => {
    try {
      const res = await getAdminSettingsFn({ data: { passcode: pass } });
      if (res.success && res.settings) {
        setNvidiaKey(res.settings.nvidiaApiKey || "");
        setGeminiKey(res.settings.geminiApiKey || "");
        setDefaultRole(res.settings.defaultRole || "Software Engineer (Entry Level)");
        setCompanyName(res.settings.companyName || "the hiring company");
        if (res.stats?.mongoPing) {
          setMongoStatus(res.stats.mongoPing);
        }
      }

      const listRes = await loadAnalysesMongoFn();
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
            nvidiaApiKey: nvidiaKey,
            geminiApiKey: geminiKey,
            defaultRole,
            companyName,
          },
        },
      });
      if (res.success) {
        toast.success("API keys & system settings saved to MongoDB Atlas!");
      } else {
        toast.error(res.error || "Failed to save settings.");
      }
    } catch {
      toast.error("Error saving settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleClearDatabase = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete all candidate analysis records in MongoDB? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      const res = await clearAnalysesMongoFn({ data: { adminPass: passcode } });
      if (res.success) {
        setAnalyses([]);
        toast.success("All candidate records cleared from MongoDB.");
      }
    } catch {
      toast.error("Failed to clear records.");
    }
  };

  const handleExportAll = async () => {
    if (!analyses.length) {
      toast.error("No records to export.");
      return;
    }
    await exportCsv(
      analyses.map((a) => ({
        fileName: a.file_name,
        analysis: a.analysis,
      })),
      `mongodb-candidates-${Date.now()}.csv`,
    );
  };

  const filteredAnalyses = analyses.filter((a) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      a.candidate_name.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      a.file_name.toLowerCase().includes(q)
    );
  });

  // Login Screen
  if (!isAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-8 shadow-2xl">
          <div className="text-center space-y-2">
            <img
              src="/favicon.png"
              alt="College Logo"
              className="mx-auto size-16 rounded-full object-contain bg-white/95 p-1 shadow-md border border-border"
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
        {/* Section 1: MongoDB Database Status */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-success/15 text-success">
                <Database className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold">MongoDB Atlas Cloud Cluster</h2>
                <p className="text-xs text-muted-foreground">
                  Cluster: cluster0.er22sa5.mongodb.net · DB: resume_radiance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                <span className="size-1.5 rounded-full bg-success animate-pulse" />
                {mongoStatus?.ok ? "Connected & Healthy" : "Connected"}
              </span>
              <Badge variant="outline" className="font-mono text-xs">
                {analyses.length} Saved Resumes
              </Badge>
            </div>
          </div>
        </section>

        {/* Section 2: Secure API Key Vault */}
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
            <div className="space-y-2">
              <Label htmlFor="nvidia-key" className="text-xs flex items-center justify-between">
                <span>NVIDIA NIM API Key (Default)</span>
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
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey((v) => !v)}
                  className="shrink-0"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Free API key from build.nvidia.com
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gemini-key" className="text-xs flex items-center justify-between">
                <span>Google Gemini API Key (Optional)</span>
                {geminiKey && (
                  <span className="text-[10px] text-success font-semibold">Active in MongoDB</span>
                )}
              </Label>
              <Input
                id="gemini-key"
                type={showKey ? "text" : "password"}
                value={geminiKey}
                placeholder="AIza..."
                onChange={(e) => setGeminiKey(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Free API key from aistudio.google.com
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 pt-2 border-t border-border/60">
            <div className="space-y-2">
              <Label htmlFor="def-role" className="text-xs">
                Default Screening Role (No JD)
              </Label>
              <Input
                id="def-role"
                value={defaultRole}
                placeholder="Software Engineer (Entry Level)"
                onChange={(e) => setDefaultRole(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="def-company" className="text-xs">
                Default Hiring Company
              </Label>
              <Input
                id="def-company"
                value={companyName}
                placeholder="the hiring company"
                onChange={(e) => setCompanyName(e.target.value)}
                className="text-xs"
              />
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

        {/* Section 3: MongoDB Candidate Records Manager */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Cpu className="size-4 text-primary" /> Candidate Database in MongoDB Atlas
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {analyses.length} total assessed records currently stored in your cloud cluster.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => void handleExportAll()}
              >
                Export All CSV
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => void handleClearDatabase()}
              >
                <Trash2 className="size-3 mr-1.5" /> Clear Records
              </Button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidate or role in MongoDB..."
              className="pl-9 text-xs"
            />
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-secondary/40">
                <TableRow>
                  <TableHead className="text-xs font-bold">Candidate</TableHead>
                  <TableHead className="text-xs font-bold">Role</TableHead>
                  <TableHead className="text-xs font-bold">Score</TableHead>
                  <TableHead className="text-xs font-bold">Readiness Tier</TableHead>
                  <TableHead className="text-xs font-bold">Evaluated Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAnalyses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      No candidate records found in MongoDB Atlas.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAnalyses.map((item) => (
                    <TableRow key={item.id} className="hover:bg-secondary/20">
                      <TableCell className="font-semibold text-xs text-foreground">
                        {item.candidate_name}
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {item.file_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.role}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-foreground">
                          {item.analysis ? effectiveScore(item.analysis) : item.overall_score}
                        </span>
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
                        {new Date(item.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </main>
    </div>
  );
}
