import { NextResponse } from "next/server";
import { getReportAnalyzer } from "@/lib/ai";
import { isLocale, type Locale } from "@/lib/i18n/translations";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Incident } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Officer-side analysis of one incident: root causes, immediate and preventive
 * actions, AML 3:3a advice, meeting recommendation. Only signed-in users may
 * call it when Supabase is configured; the client passes the incident it is
 * looking at (it already has read access) and stores the result itself.
 */
export async function POST(request: Request) {
  const analyzer = getReportAnalyzer();
  if (!analyzer) {
    return NextResponse.json({ ok: false, error: "Analysis is not configured." }, { status: 503 });
  }

  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in to analyse incidents." }, { status: 401 });
    }
  }

  let body: { incident?: Incident; language?: string };
  try {
    body = (await request.json()) as { incident?: Incident; language?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const incident = body.incident;
  if (!incident || typeof incident !== "object" || typeof incident.description !== "string") {
    return NextResponse.json({ ok: false, error: "Incident is required." }, { status: 400 });
  }
  const language: Locale = isLocale(body.language) ? body.language : "sv";

  try {
    const analysis = await analyzer.analyzeIncident({ incident, language });
    return NextResponse.json({ ok: true, provider: analyzer.name, language, analysis });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Analysis failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
