import { GoogleGenAI, Type, type Part } from "@google/genai";
import type { AnalyzeInput, IncidentAnalysisInput, ReportAnalysis, ReportAnalyzer } from "@/lib/ai/provider";
import { LOCALE_LABELS } from "@/lib/i18n/translations";
import type { IncidentAnalysis, IncidentType, RiskCategory, Severity } from "@/lib/types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const INCIDENT_TYPES: IncidentType[] = ["near-miss", "hazard", "accident"];
const CATEGORIES: RiskCategory[] = [
  "falls",
  "machine",
  "falling-objects",
  "slip-trip",
  "chemical",
  "electrical",
  "ergonomic",
];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

const REPORT_PROMPT = `You help workers on Swedish construction sites and factories report safety issues.
The worker speaks or writes in ANY language (Swedish, English, Turkish, Polish, Arabic, Lithuanian, ...).

Tasks:
1. transcript: write down exactly what the worker said, in the worker's own language. Clean up filler words only. Do not translate it.
2. originalLanguage: the ISO 639-1 code of that language.
3. summarySv: 1-2 neutral, factual Swedish sentences for the safety organisation (skyddsorganisationen). No names, no guesses, no advice.
4. summaryEn: the same summary in English.
5. type: "accident" if someone was injured; "near-miss" (tillbud) if something almost caused injury; "hazard" if the worker only observed a dangerous condition. "unknown" if unclear.
6. category: the main risk - falls (from height), machine (machinery/equipment), falling-objects, slip-trip, chemical, electrical, ergonomic. "unknown" if unclear.
7. hurt: "yes" if anyone was injured, "no" if clearly not, "unknown" if not said.
8. danger: "yes" if the dangerous condition still exists, "no" if it was removed/made safe, "unknown" if not said.
9. siteId / locationId: if the worker names a site or an area that matches one in the provided list (names may be said in another language or abbreviated), return its id, otherwise "unknown".
10. confidence: 0-1, how sure you are about type/category/hurt/danger overall.

Never invent facts that were not said. If the audio is silent or unintelligible, return an empty transcript, confidence 0 and "unknown" values.`;

const REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING },
    originalLanguage: { type: Type.STRING },
    summarySv: { type: Type.STRING },
    summaryEn: { type: Type.STRING },
    type: { type: Type.STRING, enum: [...INCIDENT_TYPES, "unknown"] },
    category: { type: Type.STRING, enum: [...CATEGORIES, "unknown"] },
    hurt: { type: Type.STRING, enum: ["yes", "no", "unknown"] },
    danger: { type: Type.STRING, enum: ["yes", "no", "unknown"] },
    siteId: { type: Type.STRING },
    locationId: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
  },
  required: ["transcript", "originalLanguage", "summarySv", "summaryEn", "type", "category", "hurt", "danger", "siteId", "locationId", "confidence"],
} as const;

const INCIDENT_PROMPT = `You are an experienced Swedish work-environment engineer (arbetsmiljöingenjör) supporting a safety officer.
You analyse one reported incident from a construction site or factory and write for the safety organisation.

Rules:
- Base everything on the report. Where the report is silent, say what should be checked instead of guessing.
- Swedish law context: AML 3 kap. 3 a § requires immediate notification to Arbetsmiljöverket for serious accidents and serious near-misses (allvarliga tillbud). Set amlReportRequired accordingly and explain in one sentence.
- Keep lists short: 2-4 items each, concrete, actionable, no generic advice.
- riskLevel: low, medium, high or critical for the situation as described.
- meetingRecommended: true when the incident warrants an emergency meeting (critical/high risk, injury, repeat risk); give a 3-5 point agenda.
- Write all text in the requested language.`;

const INCIDENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    rootCauses: { type: Type.ARRAY, items: { type: Type.STRING } },
    immediateActions: { type: Type.ARRAY, items: { type: Type.STRING } },
    preventiveActions: { type: Type.ARRAY, items: { type: Type.STRING } },
    amlReportRequired: { type: Type.BOOLEAN },
    amlReason: { type: Type.STRING },
    riskLevel: { type: Type.STRING, enum: SEVERITIES },
    meetingRecommended: { type: Type.BOOLEAN },
    meetingAgenda: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["summary", "rootCauses", "immediateActions", "preventiveActions", "amlReportRequired", "amlReason", "riskLevel", "meetingRecommended", "meetingAgenda"],
} as const;

interface RawReport {
  transcript?: string;
  originalLanguage?: string;
  summarySv?: string;
  summaryEn?: string;
  type?: string;
  category?: string;
  hurt?: string;
  danger?: string;
  siteId?: string;
  locationId?: string;
  confidence?: number;
}

interface RawIncident {
  summary?: string;
  rootCauses?: unknown;
  immediateActions?: unknown;
  preventiveActions?: unknown;
  amlReportRequired?: boolean;
  amlReason?: string;
  riskLevel?: string;
  meetingRecommended?: boolean;
  meetingAgenda?: unknown;
}

function triState(value: string | undefined): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

export class GeminiReportAnalyzer implements ReportAnalyzer {
  readonly name = `gemini:${MODEL}`;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async analyze(input: AnalyzeInput): Promise<ReportAnalysis> {
    const parts: Part[] = [];
    const siteList = (input.sites ?? [])
      .map((site) => `- site id "${site.id}": ${site.name}; areas: ${site.locations.map((l) => `id "${l.id}" = ${l.name}`).join(", ")}`)
      .join("\n");
    const context = `App language: "${input.uiLocale}" (only a hint).\nKnown sites and areas:\n${siteList || "(none)"}`;

    if (input.audio) {
      parts.push({ inlineData: { mimeType: input.audio.mimeType, data: toBase64(input.audio.data) } });
      parts.push({ text: `${context}\n\nThe worker recorded this voice note. Analyse the recording.` });
    } else {
      parts.push({ text: `${context}\n\nThe worker wrote this report:\n\n${input.text ?? ""}` });
    }

    const response = await this.client.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: REPORT_PROMPT,
        responseMimeType: "application/json",
        responseSchema: REPORT_SCHEMA,
        temperature: 0.2,
      },
    });

    const raw = parseJson<RawReport>(response.text ?? "");
    const type = INCIDENT_TYPES.includes(raw.type as IncidentType) ? (raw.type as IncidentType) : null;
    const category = CATEGORIES.includes(raw.category as RiskCategory) ? (raw.category as RiskCategory) : null;
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? 0) || 0));
    const sites = input.sites ?? [];
    const site = sites.find((item) => item.id === raw.siteId) ?? null;
    const location = site?.locations.find((item) => item.id === raw.locationId) ?? null;

    return {
      transcript: (raw.transcript ?? "").trim(),
      originalLanguage: (raw.originalLanguage ?? "").trim().toLowerCase().slice(0, 5),
      summarySv: (raw.summarySv ?? "").trim(),
      summaryEn: (raw.summaryEn ?? "").trim(),
      type,
      category,
      hurt: triState(raw.hurt),
      danger: triState(raw.danger),
      siteId: site?.id ?? null,
      locationId: location?.id ?? null,
      confidence,
    };
  }

  async analyzeIncident(input: IncidentAnalysisInput): Promise<IncidentAnalysis> {
    const { incident, language } = input;
    const languageName = LOCALE_LABELS[language]?.name ?? "Swedish";
    const text = [
      `Requested language: ${languageName}.`,
      `Reference: ${incident.reference}`,
      `Type: ${incident.type}; category: ${incident.category}; reporter-assessed severity: ${incident.severity}; status: ${incident.status}`,
      `Site: ${incident.siteName ?? incident.siteId}; area: ${incident.locationName ?? incident.locationId}`,
      `Reported at: ${incident.createdAt}; anonymous: ${incident.anonymous}`,
      incident.summarySv ? `Swedish summary: ${incident.summarySv}` : "",
      `Description (${incident.originalLanguage ?? "unknown language"}): ${incident.originalText || incident.description}`,
      incident.capa ? `Current CAPA: owner ${incident.capa.assigneeName}, due ${incident.capa.dueDate}, status ${incident.capa.status}, notes: ${incident.capa.notes}` : "No CAPA assigned yet.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.client.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        systemInstruction: INCIDENT_PROMPT,
        responseMimeType: "application/json",
        responseSchema: INCIDENT_SCHEMA,
        temperature: 0.3,
      },
    });

    const raw = parseJson<RawIncident>(response.text ?? "");
    return {
      summary: (raw.summary ?? "").trim(),
      rootCauses: strings(raw.rootCauses),
      immediateActions: strings(raw.immediateActions),
      preventiveActions: strings(raw.preventiveActions),
      amlReportRequired: Boolean(raw.amlReportRequired),
      amlReason: (raw.amlReason ?? "").trim(),
      riskLevel: SEVERITIES.includes(raw.riskLevel as Severity) ? (raw.riskLevel as Severity) : "medium",
      meetingRecommended: Boolean(raw.meetingRecommended),
      meetingAgenda: strings(raw.meetingAgenda),
    };
  }
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some responses wrap JSON in a code fence despite the MIME type.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The assistant returned no JSON.");
    return JSON.parse(match[0]) as T;
  }
}
