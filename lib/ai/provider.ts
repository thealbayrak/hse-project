import type { Locale } from "@/lib/i18n/translations";
import type { IncidentType, RiskCategory } from "@/lib/types";

/** What the assistant extracts from a worker's spoken or written report. */
export interface ReportAnalysis {
  /** The report in the worker's own words (transcribed when audio was given). */
  transcript: string;
  /** ISO 639-1 code of the language the worker used, e.g. "pl", "tr", "sv". */
  originalLanguage: string;
  /** One or two neutral Swedish sentences for the safety organisation. */
  summarySv: string;
  /** The same summary in English (for exports and non-Swedish officers). */
  summaryEn: string;
  type: IncidentType | null;
  category: RiskCategory | null;
  hurt: boolean | null;
  danger: boolean | null;
  /** 0–1; below 0.5 the UI asks the worker to check the suggestions. */
  confidence: number;
}

export interface AnalyzeInput {
  audio?: { data: Uint8Array; mimeType: string };
  text?: string;
  /** UI language, used only as a hint when the audio is ambiguous. */
  uiLocale: Locale;
}

export interface ReportAnalyzer {
  readonly name: string;
  analyze(input: AnalyzeInput): Promise<ReportAnalysis>;
}
