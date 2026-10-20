import { NextResponse } from "next/server";
import { incidentStats, type CompactIncident } from "@/lib/ai/context";
import type { AssistantTurn } from "@/lib/ai/provider";
import { clampRows, guardOfficerAi } from "@/lib/ai/route-guard";
import { isLocale, type Locale } from "@/lib/i18n/translations";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Answers a question about the company's own reports. */
export async function POST(request: Request) {
  const guard = await guardOfficerAi();
  if ("response" in guard) return guard.response;

  let body: { question?: string; history?: unknown; incidents?: unknown; language?: string; company?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 2) {
    return NextResponse.json({ ok: false, error: "Ask a question." }, { status: 400 });
  }
  const history = clampRows<AssistantTurn>(body.history, 12).filter(
    (turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string"
  );
  const incidents = clampRows<CompactIncident>(body.incidents);
  const language: Locale = isLocale(body.language) ? body.language : "sv";
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

  try {
    const answer = await guard.analyzer.answer({
      language,
      company: typeof body.company === "string" ? body.company.slice(0, 120) : null,
      question,
      history,
      incidents,
      stats: incidentStats(incidents),
      today,
    });
    return NextResponse.json({ ok: true, answer });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The assistant failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
