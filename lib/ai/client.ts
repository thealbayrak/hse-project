import type { CompactIncident } from "@/lib/ai/context";
import type { AssistantTurn, ReportAnalysis } from "@/lib/ai/provider";
import type { Locale } from "@/lib/i18n/translations";
import type { AiReport, Incident, IncidentAnalysis, Site } from "@/lib/types";

/** Officer-side: analyse an incident the user is looking at. */
export async function analyzeIncident(incident: Incident, language: Locale): Promise<IncidentAnalysis> {
  const response = await fetch("/api/ai/analyze-incident", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ incident, language }),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; analysis?: IncidentAnalysis; error?: string } | null;
  if (!response.ok || !body?.ok || !body.analysis) {
    throw new Error(body?.error || `Analysis failed (${response.status}).`);
  }
  return body.analysis;
}

/** Browser-side call to the analysis route. Throws on failure; callers fall back to manual entry. */
export async function analyzeReport(input: {
  audio?: Blob | null;
  text?: string;
  locale: Locale;
  sites?: Pick<Site, "id" | "name" | "locations">[];
}): Promise<ReportAnalysis> {
  const form = new FormData();
  form.set("locale", input.locale);
  if (input.sites?.length) {
    form.set("sites", JSON.stringify(input.sites.map((site) => ({ id: site.id, name: site.name, locations: site.locations }))));
  }
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

/** Management report over the incidents in view. */
export async function generateManagementReport(input: {
  incidents: CompactIncident[];
  language: Locale;
  scope: string;
  company?: string | null;
}): Promise<AiReport> {
  const response = await fetch("/api/ai/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; report?: AiReport; error?: string } | null;
  if (!response.ok || !body?.ok || !body.report) throw new Error(body?.error || `Report failed (${response.status}).`);
  return body.report;
}

/** One question to the assistant, with the conversation so far. */
export async function askAssistant(input: {
  question: string;
  history: AssistantTurn[];
  incidents: CompactIncident[];
  language: Locale;
  company?: string | null;
}): Promise<string> {
  const response = await fetch("/api/ai/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; answer?: string; error?: string } | null;
  if (!response.ok || !body?.ok || typeof body.answer !== "string") throw new Error(body?.error || `Assistant failed (${response.status}).`);
  return body.answer;
}
