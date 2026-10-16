import { GoogleGenAI, Type, type Part } from "@google/genai";
import type { AnalyzeInput, ReportAnalysis, ReportAnalyzer } from "@/lib/ai/provider";
import type { IncidentType, RiskCategory } from "@/lib/types";

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

const SYSTEM_PROMPT = `You help workers on Swedish construction sites and factories report safety issues.
The worker speaks or writes in ANY language (Swedish, English, Turkish, Polish, Arabic, Lithuanian, ...).

Tasks:
1. transcript: write down exactly what the worker said, in the worker's own language. Clean up filler words only. Do not translate it.
2. originalLanguage: the ISO 639-1 code of that language.
3. summarySv: 1-2 neutral, factual Swedish sentences for the safety organisation (skyddsorganisationen). No names, no guesses, no advice.
4. summaryEn: the same summary in English.
5. type: "accident" if someone was injured; "near-miss" (tillbud) if something almost caused injury; "hazard" if the worker only observed a dangerous condition. null if unclear.
6. category: the main risk - falls (from height), machine (machinery/equipment), falling-objects, slip-trip, chemical, electrical, ergonomic. null if unclear.
7. hurt: true if anyone was injured, false if clearly not, null if not said.
8. danger: true if the dangerous condition still exists, false if it was removed/made safe, null if not said.
9. confidence: 0-1, how sure you are about type/category/hurt/danger overall.

Never invent facts that were not said. If the audio is silent or unintelligible, return an empty transcript, confidence 0 and nulls.`;

const RESPONSE_SCHEMA = {
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
    confidence: { type: Type.NUMBER },
  },
  required: ["transcript", "originalLanguage", "summarySv", "summaryEn", "type", "category", "hurt", "danger", "confidence"],
} as const;

interface RawAnalysis {
  transcript?: string;
  originalLanguage?: string;
  summarySv?: string;
  summaryEn?: string;
  type?: string;
  category?: string;
  hurt?: string;
  danger?: string;
  confidence?: number;
}

function triState(value: string | undefined): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

export class GeminiReportAnalyzer implements ReportAnalyzer {
  readonly name = `gemini:${MODEL}`;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async analyze(input: AnalyzeInput): Promise<ReportAnalysis> {
    const parts: Part[] = [];
    if (input.audio) {
      parts.push({ inlineData: { mimeType: input.audio.mimeType, data: toBase64(input.audio.data) } });
      parts.push({ text: `The worker recorded this voice note. The app language is "${input.uiLocale}", which is only a hint. Analyse the recording.` });
    } else {
      parts.push({ text: `The worker wrote this report (app language "${input.uiLocale}"):\n\n${input.text ?? ""}` });
    }

    const response = await this.client.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });

    const raw = parseJson(response.text ?? "");
    const type = INCIDENT_TYPES.includes(raw.type as IncidentType) ? (raw.type as IncidentType) : null;
    const category = CATEGORIES.includes(raw.category as RiskCategory) ? (raw.category as RiskCategory) : null;
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? 0) || 0));

    return {
      transcript: (raw.transcript ?? "").trim(),
      originalLanguage: (raw.originalLanguage ?? "").trim().toLowerCase().slice(0, 5),
      summarySv: (raw.summarySv ?? "").trim(),
      summaryEn: (raw.summaryEn ?? "").trim(),
      type,
      category,
      hurt: triState(raw.hurt),
      danger: triState(raw.danger),
      confidence,
    };
  }
}

function parseJson(text: string): RawAnalysis {
  try {
    return JSON.parse(text) as RawAnalysis;
  } catch {
    // Some responses wrap JSON in a code fence despite the MIME type.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The assistant returned no JSON.");
    return JSON.parse(match[0]) as RawAnalysis;
  }
}
