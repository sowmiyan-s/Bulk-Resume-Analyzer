import { useEffect, useState } from "react";
import {
  Check,
  Code2,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Settings2,
  Shield,
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

const KEY_HINT: Record<ProviderId, string> = {
  nvidia:
    "Free API key at build.nvidia.com → 'Get API Key'. (Leave blank if already saved in Admin Vault).",
  gemini:
    "Free API key at aistudio.google.com/apikey. (Leave blank if already saved in Admin Vault).",
  litellm:
    "Enter your LiteLLM master/virtual key (e.g. sk-...), or leave blank if your proxy runs unauthenticated.",
  "openai-compatible": "Use the key for whichever endpoint you point at (Groq, OpenRouter, vLLM…).",
};

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

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  const model = findModel(draft.modelId);
  const grouped = modelsByProvider();
  const isCustom = model.provider === "openai-compatible";

  const save = () => {
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
          className="h-8 gap-1.5 rounded-xl border-border/80 bg-secondary/50 px-3 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
        >
          <Settings2 className="size-3.5 text-primary" />
          <span>AI Engine</span>
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
          {/* Section 1: Model Selection */}
          <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-primary" /> 1. Model Provider
            </h3>

            <div className="space-y-2">
              <Label htmlFor="model-select" className="text-xs">
                Active LLM Model
              </Label>
              <Select
                value={draft.modelId}
                onValueChange={(val) => {
                  setDraft({
                    ...draft,
                    modelId: val,
                  });
                }}
              >
                <SelectTrigger id="model-select" className="text-xs">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(Object.keys(grouped) as ProviderId[]).map((prov) => {
                    const list = grouped[prov];
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
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] px-1.5 py-0 font-medium"
                                >
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

            {/* Custom URL for OpenAI-compatible / LiteLLM */}
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

            {/* API Key Input */}
            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-xs flex items-center justify-between">
                <span>Personal API Key Override (Optional)</span>
                {draft.apiKey ? (
                  <span className="text-[10px] text-success font-medium">
                    Overriding system key
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Using Admin Vault Key</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  placeholder="Leave empty to use shared key from Admin Vault..."
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide API Key" : "Show API Key"}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{KEY_HINT[model.provider]}</p>
            </div>
          </div>

          {/* Section 2: MongoDB Atlas Cloud & Admin Portal */}
          <div className="space-y-3 rounded-xl border border-border bg-secondary/15 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Database className="size-3.5 text-primary" /> 2. MongoDB Atlas Database
              </h3>
              <Badge
                variant="outline"
                className="border-success/40 bg-success/10 text-success text-[10px]"
              >
                Connected &amp; Active
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Candidate resumes and evaluation metrics are automatically synchronized to your
              MongoDB Atlas cluster (
              <code className="text-primary font-mono text-[11px]">resume_radiance</code>).
            </p>

            <div className="pt-1">
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Shield className="size-3.5" /> Open Admin Portal to Manage Database &amp; System
                Keys →
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
