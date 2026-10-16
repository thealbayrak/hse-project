import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildCriticalIncidentEmail } from "@/lib/alerts/critical-incident-email";
import type { CriticalIncidentAlertPayload } from "@/lib/alerts/critical-incident";
import { parseAlertRequest } from "@/lib/alerts/parse-alert-request";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mapCategory, mapIncidentType, mapSeverity } from "@/lib/supabase/mappers";
import { createAnonServerClient } from "@/lib/supabase/server";
import type { ClaimedAlertRow } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

/**
 * Sends the AML 3:3a critical-incident e-mail.
 *
 * Trust model:
 *  - With Supabase, the body is only used for its `incidentId`. The route calls
 *    the `claim_incident_alert` RPC, which returns the incident exactly once and
 *    only if it is critical, so the e-mail can be neither forged nor repeated.
 *    Both the browser (after submitting) and a Supabase Database Webhook
 *    (protected by `ALERT_WEBHOOK_SECRET`) may trigger it; whichever arrives
 *    first wins, the other is a no-op.
 *  - Without Supabase (demo mode) the client payload itself is e-mailed.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseAlertRequest(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "Invalid alert payload." }, { status: 400 });
  }

  if (parsed.kind === "webhook") {
    const secret = process.env.ALERT_WEBHOOK_SECRET;
    const provided = request.headers.get("x-alert-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!secret || provided !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
  }

  let payload: CriticalIncidentAlertPayload | null = null;

  if (isSupabaseConfigured()) {
    const claimed = await claimIncident(parsed.incidentId);
    if (claimed === "error") {
      return NextResponse.json({ ok: false, error: "Could not verify the incident." }, { status: 502 });
    }
    if (!claimed) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    }
    payload = claimed;
  } else if (parsed.kind === "client") {
    payload = parsed.payload;
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Invalid alert payload." }, { status: 400 });
    }
    if (payload.severity !== "critical") {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    }
  } else {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.SAFETY_ALERT_RECIPIENT;
  const from = process.env.RESEND_FROM ?? "SiteSafety Nordic <onboarding@resend.dev>";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  if (!apiKey || !recipient) {
    return NextResponse.json(
      { ok: false, error: "Email alert environment is not configured." },
      { status: 500 }
    );
  }

  const dashboardUrl = `${appUrl.replace(/\/$/, "")}/dashboard?incidentId=${encodeURIComponent(payload.incidentId)}`;
  const email = buildCriticalIncidentEmail(payload, dashboardUrl);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: recipient.split(",").map((address) => address.trim()).filter(Boolean),
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null }, { status: 200 });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Failed to send safety alert.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function claimIncident(incidentId: string): Promise<CriticalIncidentAlertPayload | null | "error"> {
  const client = createAnonServerClient();
  const result = await client.rpc("claim_incident_alert", { p_id: incidentId });
  if (result.error) return "error";

  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as ClaimedAlertRow | undefined;
  if (!row) return null;

  const type = mapIncidentType(row.type);
  const severity = mapSeverity(row.severity);
  return {
    incidentId: row.id,
    type,
    category: mapCategory(row.category),
    severity,
    title: row.reference,
    description: row.description,
    siteName: row.site_name,
    specificLocation: row.location_name,
    occurredAt: row.created_at,
    requiresArbetsmiljoverketReport: severity === "critical" || type === "accident",
  };
}
