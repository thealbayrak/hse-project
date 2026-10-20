import type { Locale } from "@/lib/i18n/translations";
import type { CompactIncident, IncidentStats } from "@/lib/ai/context";
import type { AiReport, Incident, IncidentAnalysis, IncidentType, RiskCategory, Site } from "@/lib/types";

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
  /** Site / area the worker mentioned, matched against the list the app passed in. */
  siteId: string | null;
  locationId: string | null;
  /** 0–1; below 0.5 the UI asks the worker to check the suggestions. */
  confidence: number;
}

export interface AnalyzeInput {
  audio?: { data: Uint8Array; mimeType: string };
  text?: string;
  /** UI language, used only as a hint when the audio is ambiguous. */
  uiLocale: Locale;
  /** Sites and areas the worker may be referring to (ids are what we want back). */
  sites?: Pick<Site, "id" | "name" | "locations">[];
}

export interface IncidentAnalysisInput {
  incident: Incident;
  /** Language the officer reads; the analysis is written in it. */
  language: Locale;
}

export interface ManagementReportInput {
  language: Locale;
  /** Company (tenant) the report is for, when known. */
  company: string | null;
  /** Human-readable scope, e.g. "2026-10-01 – 2026-10-20 · Observations". */
  scope: string;
  incidents: CompactIncident[];
  stats: IncidentStats;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantInput {
  language: Locale;
  company: string | null;
  question: string;
  history: AssistantTurn[];
  incidents: CompactIncident[];
  stats: IncidentStats;
  /** Today in Europe/Stockholm, so "this week" means something. */
  today: string;
}

export interface ReportAnalyzer {
  readonly name: string;
  analyze(input: AnalyzeInput): Promise<ReportAnalysis>;
  analyzeIncident(input: IncidentAnalysisInput): Promise<IncidentAnalysis>;
  /** A written management report over many incidents. */
  managementReport(input: ManagementReportInput): Promise<AiReport>;
  /** Answers a question about the company's safety data. */
  answer(input: AssistantInput): Promise<string>;
}
