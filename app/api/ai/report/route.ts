import { NextResponse } from "next/server";
import { incidentStats, type CompactIncident } from "@/lib/ai/context";
import { clampRows, guardOfficerAi } from "@/lib/ai/route-guard";
import { isLocale, type Locale } from "@/lib/i18n/translations";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Writes a management report over the incidents the officer is looking at
 * (the client sends what it can already read; row level security decided that).
 */
export async function POST(request: Request) {
  const guard = await guardOfficerAi();
  if ("response" in guard) return guard.response;

  let body: { incidents?: unknown; language?: string; scope?: string; company?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const incidents = clampRows<CompactIncident>(body.incidents);
  if (!incidents.length) {
    return NextResponse.json({ ok: false, error: "There are no reports in this view." }, { status: 400 });
  }
  const language: Locale = isLocale(body.language) ? body.language : "sv";

  try {
    const report = await guard.analyzer.managementReport({
      language,
      company: typeof body.company === "string" ? body.company.slice(0, 120) : null,
      scope: typeof body.scope === "string" ? body.scope.slice(0, 200) : "",
      incidents,
      stats: incidentStats(incidents),
    });
    return NextResponse.json({ ok: true, report });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Report failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
