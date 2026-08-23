/** localStorage-backed settings. API keys are strictly forbidden from localStorage and only stored in MongoDB. */

import { DEFAULT_SETTINGS, type LlmSettings } from "./llm";

const KEY = "resume-radiance.settings.v1";

export function loadSettings(): LlmSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LlmSettings> & { apiKey?: string };
    if ("apiKey" in parsed) {
      delete parsed.apiKey;
    }
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      modelId: (typeof parsed.modelId === "string" && parsed.modelId.trim()) || DEFAULT_SETTINGS.modelId,
      temperature: Number.isFinite(parsed.temperature)
        ? Number(parsed.temperature)
        : DEFAULT_SETTINGS.temperature,
      maxTokens: Number.isFinite(parsed.maxTokens)
        ? Number(parsed.maxTokens)
        : DEFAULT_SETTINGS.maxTokens,
      customBaseUrl: typeof parsed.customBaseUrl === "string" ? parsed.customBaseUrl : DEFAULT_SETTINGS.customBaseUrl,
      proxyUrl: typeof parsed.proxyUrl === "string" ? parsed.proxyUrl : DEFAULT_SETTINGS.proxyUrl,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: LlmSettings) {
  if (typeof window === "undefined") return;
  try {
    const sanitized = { ...s };
    delete (sanitized as Record<string, unknown>)["apiKey"];
    window.localStorage.setItem(KEY, JSON.stringify(sanitized));
  } catch {
    /* quota or private mode — settings just won't persist */
  }
}

export function clearSettings() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
