import type { ReportAnalysis } from "@/lib/ai/provider";
import type { Locale } from "@/lib/i18n/translations";

/** Browser-side call to the analysis route. Throws on failure; callers fall back to manual entry. */
export async function analyzeReport(input: { audio?: Blob | null; text?: string; locale: Locale }): Promise<ReportAnalysis> {
  const form = new FormData();
  form.set("locale", input.locale);
  if (input.audio && input.audio.size > 0) {
    const ext = input.audio.type.includes("mp4") ? "m4a" : input.audio.type.includes("ogg") ? "ogg" : "webm";
    form.set("audio", input.audio, `voice.${ext}`);
  } else if (input.text) {
    form.set("text", input.text);
  }

  const response = await fetch("/api/ai/analyze-report", { method: "POST", body: form });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; analysis?: ReportAnalysis; error?: string } | null;
  if (!response.ok || !body?.ok || !body.analysis) {
    throw new Error(body?.error || `Analysis failed (${response.status}).`);
  }
  return body.analysis;
}

/** Human-readable language name for an ISO code, in the UI language. */
export function languageName(code: string, uiLocale: Locale) {
  if (!code) return "";
  try {
    const names = new Intl.DisplayNames([uiLocale], { type: "language" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
