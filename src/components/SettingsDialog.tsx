import { useEffect, useState } from "react";
import {
  Check,
  Cpu,
  Database,
  KeyRound,
  Lock,
  Settings2,
  Shield,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { LlmSettings } from "@/lib/llm";
import { findModel, modelsByProvider, PROVIDER_LABEL, type ProviderId } from "@/lib/models";
import type { SystemInfo } from "@/routes/index";

export function SettingsDialog({
  settings,
  systemInfo,
  onRefreshSystem,
  onSave,
}: {
  settings: LlmSettings;
  systemInfo?: SystemInfo;
  onRefreshSystem?: () => void;
  onSave: (next: LlmSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LlmSettings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      onRefreshSystem?.();
    }
  }, [open, settings, onRefreshSystem]);

  const model = findModel(draft.modelId);
  const isCustom = model.provider === "openai-compatible";

  const handleModelChange = (newModelId: string) => {
    const nextModel = findModel(newModelId);
    setDraft((prev) => ({
      ...prev,
      modelId: newModelId,
    }));
    toast.info(`Switched to ${nextModel.label}`);
  };

  const save = () => {
    if (isCustom && !draft.customBaseUrl.trim()) {
      toast.error("A custom model needs a base URL.");
      return;
    }
    onSave(draft);
    setOpen(false);
    toast.success(`Active model updated to ${model.label}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-xl border-border/80 bg-secondary/50 px-3 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
        >
          <Settings2 className="size-3.5 text-primary" />
          <span>Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[580px] p-6 rounded-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Cpu className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                Screening Engine &amp; Cloud
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure LLM models, parameters, and MongoDB cloud sync.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Section 1: Active Screening Model Selector */}
          <div className="space-y-4 rounded-xl border border-primary/30 bg-secondary/20 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Cpu className="size-3.5 text-primary" /> Active Screening Model
              </h3>
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px] font-semibold flex items-center gap-1">
                <Zap className="size-3" /> Live Switching
              </Badge>
            </div>

            <div className="space-y-2">
              <Select value={draft.modelId} onValueChange={handleModelChange}>
                <SelectTrigger className="text-xs font-semibold border-primary/40 bg-background/90 h-9">
                  <SelectValue placeholder="Select screening model" />
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

            <div className="rounded-xl border border-border/80 bg-background/70 p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  {model.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    Recommended: {model.recommendedConcurrency} worker{model.recommendedConcurrency > 1 ? "s" : ""} · {model.recommendedCooldownSec}s delay
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-border bg-secondary/50 font-mono">
                    {model.provider.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {model.note}
              </p>
              <div className="pt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/40">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Shield className="size-3 text-primary" /> Master API keys managed in Admin Portal.
                </span>
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                >
                  Admin Portal Keys &amp; Vault →
                </Link>
              </div>
            </div>

            {/* Custom URL for OpenAI-compatible / LiteLLM if applicable */}
            {(isCustom || model.provider === "litellm") && (
              <div className="space-y-2">
                <Label htmlFor="base-url" className="text-xs">
                  {isCustom ? "API Base URL (OpenAI-compatible)" : "LiteLLM Proxy Base URL"}
                </Label>
                <Input
                  id="base-url"
                  value={draft.customBaseUrl}
                  placeholder={
                    isCustom ? "https://api.groq.com/openai/v1" : "http://localhost:4000/v1"
                  }
                  onChange={(e) => setDraft({ ...draft, customBaseUrl: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            )}

            {/* Centralized MongoDB Key Status & Auto-Failover */}
            <div className="rounded-xl border border-border/70 bg-background/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <KeyRound className="size-3.5 text-primary" /> Multi-Provider Auto-Failover
                </span>
                <Badge variant="outline" className="border-success/40 bg-success/10 text-success text-[10px] font-semibold flex items-center gap-1">
                  <Check className="size-3" /> Auto Rate-Limit Cascade
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                If the active model encounters rate limits (HTTP 429), the engine automatically cascades to other active providers in MongoDB Vault (Qwen DashScope, Cerebras, Groq, Gemini, OpenRouter, NVIDIA) with zero downtime.
              </p>
            </div>
          </div>

          {/* Section 2: MongoDB Atlas Cloud & Admin Portal */}
          <div className="space-y-3 rounded-xl border border-border bg-secondary/15 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Database className="size-3.5 text-primary" /> 2. MongoDB Atlas Database Vault
              </h3>
              <Badge
                variant="outline"
                className="border-success/40 bg-success/10 text-success text-[10px]"
              >
                Connected &amp; Active
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Candidate resumes and evaluation metrics are synchronized to MongoDB Atlas (
              <code className="text-primary font-mono text-[11px]">resume_radiance</code>). System-wide API keys stored in the database vault are used automatically.
            </p>

            <div className="pt-1">
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Shield className="size-3.5" /> Open Admin Portal to Manage Database &amp; Vault Keys →
              </Link>
            </div>
          </div>

          {/* Section 3: Evaluation Role Defaults */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default-role" className="text-xs">
                Default Role (When no JD provided)
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
                <span className="font-mono text-xs text-muted-foreground">{draft.temperature}</span>
              </div>
              <Slider
                value={[draft.temperature]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([val]) => setDraft({ ...draft, temperature: val ?? 0.2 })}
              />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <Label className="text-xs">Max Output Tokens</Label>
                <span className="font-mono text-xs text-muted-foreground">{draft.maxTokens}</span>
              </div>
              <Slider
                value={[draft.maxTokens]}
                min={1024}
                max={8192}
                step={256}
                onValueChange={([val]) => setDraft({ ...draft, maxTokens: val ?? 4096 })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-xs">
            Cancel
          </Button>
          <Button onClick={save} className="text-xs font-semibold">
            <Check className="size-3.5 mr-1" /> Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

