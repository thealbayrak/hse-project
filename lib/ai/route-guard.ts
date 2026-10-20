import { NextResponse } from "next/server";
import { getReportAnalyzer } from "@/lib/ai";
import type { ReportAnalyzer } from "@/lib/ai/provider";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Officer-side AI routes: a provider must be configured and, with Supabase, the caller signed in. */
export async function guardOfficerAi(): Promise<{ analyzer: ReportAnalyzer } | { response: NextResponse }> {
  const analyzer = getReportAnalyzer();
  if (!analyzer) {
    return { response: NextResponse.json({ ok: false, error: "The assistant is not configured." }, { status: 503 }) };
  }
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { response: NextResponse.json({ ok: false, error: "Sign in to use the assistant." }, { status: 401 }) };
    }
  }
  return { analyzer };
}

/** Keeps request bodies to a size the model and the function limits can take. */
export function clampRows<T>(rows: unknown, max = 300): T[] {
  return Array.isArray(rows) ? (rows.slice(0, max) as T[]) : [];
}
