import { useEffect, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { LlmSettings } from "@/lib/llm";
import { PROVIDER_LABEL, findModel, modelsByProvider, type ProviderId } from "@/lib/models";
import { testSupabaseConnection } from "@/lib/storage";

const KEY_HINT: Record<ProviderId, string> = {
  nvidia:
    "Get a free key at build.nvidia.com → any model page → 'Get API Key' (starts with nvapi-).",
  gemini: "Get a free key at aistudio.google.com/apikey (starts with AIza).",
  litellm:
    "Enter your LiteLLM master/virtual key (e.g. sk-...), or leave blank if your local proxy runs unauthenticated.",
  "openai-compatible": "Use the key for whichever endpoint you point at (Groq, OpenRouter, vLLM…).",
};

const SQL_SCHEMA = `-- Run this in your Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.analyses (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    candidate_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Software Engineer (Entry Level)',
    overall_score INTEGER NOT NULL DEFAULT 0,
    readiness_tier TEXT NOT NULL DEFAULT 'Tier 3: Overhaul Required',
    evaluation_basis TEXT NOT NULL DEFAULT 'role-fit',
    assumed_role TEXT DEFAULT '',
    jd_score INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analysis JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_analyses_score ON public.analyses (overall_score DESC);
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access" ON public.analyses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);`;

export function SettingsDialog({
  settings,
  onSave,
}: {
  settings: LlmSettings;
  onSave: (next: LlmSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LlmSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [showSbKey, setShowSbKey] = useState(false);
  const [testingSb, setTestingSb] = useState(false);
  const [sbStatus, setSbStatus] = useState<{
    tested: boolean;
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setSbStatus(null);
    }
  }, [open, settings]);

  const model = findModel(draft.modelId);
  const grouped = modelsByProvider();
  const isCustom = model.provider === "openai-compatible";
  const isLiteLlm = model.provider === "litellm";

  const runTestSupabase = async () => {
    setTestingSb(true);
    setSbStatus(null);
    try {
      const res = await testSupabaseConnection(draft.supabaseUrl, draft.supabaseAnonKey);
      setSbStatus({ tested: true, ok: res.ok, message: res.message });
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setTestingSb(false);
    }
  };

  const copySql = () => {
    void navigator.clipboard.writeText(SQL_SCHEMA);
    toast.success("Supabase SQL schema copied to clipboard!");
  };

  const save = () => {
    if (!draft.apiKey.trim() && !isLiteLlm) {
      toast.error("Paste an API key first.");
      return;
    }
    if (isCustom && !draft.customBaseUrl.trim()) {
      toast.error("A custom model needs a base URL.");
      return;
    }
    onSave(draft);
    setOpen(false);
    toast.success("Settings saved.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-xl text-xs font-medium border-border/80 hover:bg-secondary"
        >
          <Settings2 className="size-3.5" /> AI Engine
          {!settings.apiKey && !isLiteLlm && (
            <Badge
              variant="outline"
              className="ml-1 border-warning/50 text-warning text-[10px] py-0 px-1.5"
            >
              Set Key
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Cpu className="size-4.5 text-primary" /> AI Engine &amp; Cloud Database Settings
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure LLM inference providers and cloud storage sync.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Section 1: AI Inference Provider */}
          <div className="space-y-4 rounded-xl border border-border bg-secondary/15 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Cpu className="size-3.5 text-primary" /> 1. AI Inference Provider
            </h3>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={draft.modelId}
                onValueChange={(v) => setDraft({ ...draft, modelId: v })}
              >
                <SelectTrigger className="h-10 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {(Object.keys(grouped) as ProviderId[]).map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel className="text-xs font-semibold text-primary">
                        {PROVIDER_LABEL[provider]}
                      </SelectLabel>
                      {grouped[provider]!.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs py-2">
                          <div className="flex items-center justify-between gap-3 w-full">
                            <span>{m.label}</span>
                            <span className="rounded bg-secondary/80 px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground border border-border/50">
                              {m.tag}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{model.note}</p>
            </div>

            {isLiteLlm && (
              <div className="space-y-2">
                <Label htmlFor="litellm-base">LiteLLM Proxy URL</Label>
                <Input
                  id="litellm-base"
                  value={draft.customBaseUrl}
                  placeholder="http://localhost:4000/v1"
                  onChange={(e) => setDraft({ ...draft, customBaseUrl: e.target.value })}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Default: http://localhost:4000/v1. Change if your LiteLLM server is hosted
                  remotely.
                </p>
              </div>
            )}

            {isCustom && (
              <div className="space-y-2">
                <Label htmlFor="base">Custom base URL</Label>
                <Input
                  id="base"
                  value={draft.customBaseUrl}
                  placeholder="https://api.groq.com/openai/v1"
                  onChange={(e) => setDraft({ ...draft, customBaseUrl: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="api-key" className="flex items-center gap-2">
                <KeyRound className="size-3.5" /> API Key — {PROVIDER_LABEL[model.provider]}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={model.provider === "nvidia" ? "nvapi-…" : "AIza…"}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{KEY_HINT[model.provider]}</p>
            </div>
          </div>

          {/* Section 2: Supabase Cloud Integration */}
          <div className="space-y-4 rounded-xl border border-border bg-secondary/15 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Database className="size-3.5 text-primary" /> 2. Supabase Cloud Sync (Optional)
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary"
                onClick={copySql}
              >
                <Copy className="size-3 mr-1" /> Copy SQL Schema
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically persist screening records to your Supabase project so your placement
              team can view and export historical batches from any device.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sb-url" className="text-xs">
                  Supabase Project URL
                </Label>
                <Input
                  id="sb-url"
                  value={draft.supabaseUrl || ""}
                  placeholder="https://your-project.supabase.co"
                  onChange={(e) => setDraft({ ...draft, supabaseUrl: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sb-key" className="text-xs">
                  Supabase Anon Public API Key
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="sb-key"
                    type={showSbKey ? "text" : "password"}
                    value={draft.supabaseAnonKey || ""}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    onChange={(e) => setDraft({ ...draft, supabaseAnonKey: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSbKey((v) => !v)}
                    aria-label={showSbKey ? "Hide Supabase Key" : "Show Supabase Key"}
                  >
                    {showSbKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={testingSb || !draft.supabaseUrl?.trim()}
                  onClick={() => void runTestSupabase()}
                  className="text-xs h-8"
                >
                  {testingSb ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Database className="size-3.5 mr-1.5" />
                  )}
                  {testingSb ? "Testing Connection..." : "Test Supabase Connection"}
                </Button>

                {sbStatus && (
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                      sbStatus.ok
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {sbStatus.ok ? "Connected" : "Failed"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Evaluation Role Defaults */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default-role" className="text-xs">
                Default Screening Role (No JD)
              </Label>
              <Input
                id="default-role"
                value={draft.defaultRole}
                placeholder="e.g. Software Engineer (Entry Level)"
                onChange={(e) => setDraft({ ...draft, defaultRole: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company" className="text-xs">
                Hiring Company Name
              </Label>
              <Input
                id="company"
                value={draft.companyName}
                placeholder="e.g. Acme Placement Corp"
                onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          {/* Section 4: Parameters */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <Label className="text-xs">Temperature</Label>
                <span className="font-mono text-xs text-primary font-bold">
                  {draft.temperature.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[draft.temperature]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([v]) => setDraft({ ...draft, temperature: v ?? 0.2 })}
              />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <Label className="text-xs">Max Output Tokens</Label>
                <span className="font-mono text-xs text-primary font-bold">{draft.maxTokens}</span>
              </div>
              <Slider
                value={[draft.maxTokens]}
                min={1200}
                max={4000}
                step={100}
                onValueChange={([v]) => setDraft({ ...draft, maxTokens: v ?? 2000 })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save}>
            <Check className="size-4 mr-1" /> Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
