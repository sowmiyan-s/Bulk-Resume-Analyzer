/** localStorage-backed settings. Keys never leave the browser except to the provider. */

import { DEFAULT_SETTINGS, type LlmSettings } from "./llm";

const KEY = "resume-radiance.settings.v1";

export function loadSettings(): LlmSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      temperature: Number.isFinite(parsed.temperature)
        ? Number(parsed.temperature)
        : DEFAULT_SETTINGS.temperature,
      maxTokens: Number.isFinite(parsed.maxTokens)
        ? Number(parsed.maxTokens)
        : DEFAULT_SETTINGS.maxTokens,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: LlmSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
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
