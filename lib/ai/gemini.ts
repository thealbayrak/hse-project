import { GoogleGenAI, Type, type Part } from "@google/genai";
import type { AnalyzeInput, AssistantInput, IncidentAnalysisInput, ManagementReportInput, ReportAnalysis, ReportAnalyzer } from "@/lib/ai/provider";
import { LOCALE_LABELS } from "@/lib/i18n/translations";
import type { AiReport, IncidentAnalysis, IncidentType, RiskCategory, Severity } from "@/lib/types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const INCIDENT_TYPES: IncidentType[] = ["near-miss", "hazard", "accident", "environmental", "good-observation", "positive-observation"];
const CATEGORIES: RiskCategory[] = [
  "falls",
  "machine",
  "falling-objects",
  "slip-trip",
  "chemical",
  "electrical",
  "ergonomic",
  "ppe",
  "fire",
  "traffic",
  "confined-space",
  "noise-vibration",
  "dust-air",
  "housekeeping",
  "environment-spill",
  "psychosocial",
  "other",
];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

const REPORT_PROMPT = `You help workers on Swedish construction sites and factories report safety issues.
The worker speaks or writes in ANY language (Swedish, English, Turkish, Polish, Arabic, Lithuanian, ...).

Tasks:
1. transcript: write down exactly what the worker said, in the worker's own language. Clean up filler words only. Do not translate it.
2. originalLanguage: the ISO 639-1 code of that language.
3. summarySv: 1-2 neutral, factual Swedish sentences for the safety organisation (skyddsorganisationen). No names, no guesses, no advice.
4. summaryEn: the same summary in English.
5. type: "accident" if someone was injured; "near-miss" (tillbud) if something almost caused injury; "hazard" if the worker only observed a dangerous condition; "environmental" for a spill, emission, leak or waste problem; "good-observation" or "positive-observation" if the worker praises good practice or safe behaviour and nothing went wrong. "unknown" if unclear.
6. category: the main risk - falls (from height), machine (machinery/equipment), falling-objects, slip-trip, chemical, electrical, ergonomic, ppe (missing protective equipment), fire (fire/hot work), traffic (vehicles), confined-space, noise-vibration, dust-air, housekeeping (order/cleanliness), environment-spill, psychosocial (stress/harassment), other. "unknown" if unclear.
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
You analyse one reported incident from a workplace (any industry: plant, factory, construction, logistics) and write for the safety organisation.

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

const MANAGEMENT_PROMPT = `You are an HSE (health, safety and environment) analyst writing a short management report for one company's safety organisation.
The company can be in any industry: car plant, bottle factory, construction, logistics, food. Do not assume construction.

Rules:
- Use only the incidents and the exact counts you are given. Never invent incidents, numbers, names or dates.
- keyFigures: 4-6 figures taken from the exact counts (e.g. total reports, open, critical, overdue, not yet classified).
- trends: 2-4 observations about change over time or concentration (by type, place, risk). Say "not enough data" when there is too little.
- topRisks: the most frequent or most severe risk types with their count from the data and one-line comment.
- hotspots: places or areas that stand out, with the reason.
- recommendations: 3-5 concrete, prioritised actions for the coming period. Mention Swedish SAM (AFS 2001:1) or AML 3:3a only when relevant.
- positives: good observations or improvements worth recognising; empty list if none.
- Refer to incidents by their reference (e.g. SS-2026-0012) when you mention a specific one.
- Write all text in the requested language. Keep it short and factual.`;

const MANAGEMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    keyFigures: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, value: { type: Type.STRING } }, required: ["label", "value"] },
    },
    trends: { type: Type.ARRAY, items: { type: Type.STRING } },
    topRisks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { risk: { type: Type.STRING }, count: { type: Type.NUMBER }, comment: { type: Type.STRING } },
        required: ["risk", "count", "comment"],
      },
    },
    hotspots: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
    positives: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["title", "summary", "keyFigures", "trends", "topRisks", "hotspots", "recommendations", "positives"],
} as const;

interface RawManagement {
  title?: string;
  summary?: string;
  keyFigures?: { label?: string; value?: unknown }[];
  trends?: unknown;
  topRisks?: { risk?: string; count?: unknown; comment?: unknown }[];
  hotspots?: unknown;
  recommendations?: unknown;
  positives?: unknown;
}

const ASSISTANT_PROMPT = `You are the HSE assistant inside a safety reporting app. You help a company's managers and safety officers understand their own reports.
- Answer only from the incidents and counts given in the conversation. If the data does not contain the answer, say so and suggest what to check.
- Quote exact numbers from the counts. Name incidents by reference (e.g. SS-2026-0012).
- Be brief: a few sentences or a short list. Use plain text with "-" bullets, no tables.
- When asked for advice, give concrete, practical steps for that workplace; mention Swedish SAM (AFS 2001:1) or AML 3:3a only when relevant.
- Never reveal anonymous reporters or guess who they are.`;

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

  async managementReport(input: ManagementReportInput): Promise<AiReport> {
    const languageName = LOCALE_LABELS[input.language]?.name ?? "Swedish";
    const text = [
      `Requested language: ${languageName}.`,
      `Company: ${input.company ?? "(several companies)"}`,
      `Scope: ${input.scope}`,
      `Exact counts (use these numbers, do not recount): ${JSON.stringify(input.stats)}`,
      `Incidents (newest first, JSON lines):`,
      ...input.incidents.map((row) => JSON.stringify(row)),
    ].join("\n");

    const response = await this.client.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        systemInstruction: MANAGEMENT_PROMPT,
        responseMimeType: "application/json",
        responseSchema: MANAGEMENT_SCHEMA,
        temperature: 0.3,
      },
    });

    const raw = parseJson<RawManagement>(response.text ?? "");
    return {
      title: (raw.title ?? "").trim() || input.scope,
      summary: (raw.summary ?? "").trim(),
      keyFigures: Array.isArray(raw.keyFigures)
        ? raw.keyFigures
            .filter((item): item is { label: string; value: string } => Boolean(item && typeof item.label === "string"))
            .map((item) => ({ label: item.label.trim(), value: String(item.value ?? "").trim() }))
            .slice(0, 8)
        : [],
      trends: strings(raw.trends),
      topRisks: Array.isArray(raw.topRisks)
        ? raw.topRisks
            .filter((item): item is { risk: string; count: number; comment: string } => Boolean(item && typeof item.risk === "string"))
            .map((item) => ({ risk: item.risk.trim(), count: Math.max(0, Math.round(Number(item.count) || 0)), comment: String(item.comment ?? "").trim() }))
            .slice(0, 6)
        : [],
      hotspots: strings(raw.hotspots),
      recommendations: strings(raw.recommendations),
      positives: strings(raw.positives),
    };
  }

  async answer(input: AssistantInput): Promise<string> {
    const languageName = LOCALE_LABELS[input.language]?.name ?? "Swedish";
    const context = [
      `Answer in ${languageName}. Today is ${input.today} (Europe/Stockholm).`,
      `Company: ${input.company ?? "(several companies)"}`,
      `Exact counts for the data below: ${JSON.stringify(input.stats)}`,
      `Incidents (newest first, JSON lines):`,
      ...input.incidents.map((row) => JSON.stringify(row)),
    ].join("\n");

    const contents = [
      { role: "user", parts: [{ text: context }] },
      { role: "model", parts: [{ text: "Understood. I will answer only from this data." }] },
      ...input.history.slice(-8).map((turn) => ({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.text.slice(0, 2000) }] })),
      { role: "user", parts: [{ text: input.question.slice(0, 2000) }] },
    ];

    const response = await this.client.models.generateContent({
      model: MODEL,
      contents,
      config: { systemInstruction: ASSISTANT_PROMPT, temperature: 0.3 },
    });
    return (response.text ?? "").trim();
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
