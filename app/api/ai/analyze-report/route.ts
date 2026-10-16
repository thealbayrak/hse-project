import { NextResponse } from "next/server";
import { getReportAnalyzer, isReportAnalysisEnabled } from "@/lib/ai";
import { isLocale, type Locale } from "@/lib/i18n/translations";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 4000;

/** Lets the client know whether the voice/text assistant is available. */
export async function GET() {
  return NextResponse.json({ enabled: isReportAnalysisEnabled() });
}

/**
 * Turns a worker's voice note (any language) or typed text into a transcript,
 * a Swedish summary and suggested classification. The API key stays on the
 * server; the browser only ever talks to this route.
 */
export async function POST(request: Request) {
  const analyzer = getReportAnalyzer();
  if (!analyzer) {
    return NextResponse.json({ ok: false, error: "Report analysis is not configured." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart form data." }, { status: 400 });
  }

  const localeValue = form.get("locale");
  const uiLocale: Locale = typeof localeValue === "string" && isLocale(localeValue) ? localeValue : "sv";
  const audio = form.get("audio");
  const text = form.get("text");

  try {
    if (audio instanceof Blob && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ ok: false, error: "Voice note is too large." }, { status: 413 });
      }
      const mimeType = (audio.type || "audio/webm").split(";")[0];
      if (!mimeType.startsWith("audio/")) {
        return NextResponse.json({ ok: false, error: "Only audio files are accepted." }, { status: 415 });
      }
      const data = new Uint8Array(await audio.arrayBuffer());
      const analysis = await analyzer.analyze({ audio: { data, mimeType }, uiLocale });
      return NextResponse.json({ ok: true, provider: analyzer.name, analysis });
    }

    if (typeof text === "string" && text.trim().length >= 8) {
      const analysis = await analyzer.analyze({ text: text.trim().slice(0, MAX_TEXT_CHARS), uiLocale });
      return NextResponse.json({ ok: true, provider: analyzer.name, analysis });
    }

    return NextResponse.json({ ok: false, error: "Send a voice note or at least a sentence of text." }, { status: 400 });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Analysis failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
