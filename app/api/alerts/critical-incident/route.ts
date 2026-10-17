import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildCriticalIncidentEmail } from "@/lib/alerts/critical-incident-email";
import type { CriticalIncidentAlertPayload } from "@/lib/alerts/critical-incident";
import { parseAlertRequest } from "@/lib/alerts/parse-alert-request";
import { buildRoutingEmail, type RoutingReason } from "@/lib/alerts/routing-email";
import { isLocale, type Locale } from "@/lib/i18n/translations";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mapCategory, mapIncidentType, mapRole, mapSeverity } from "@/lib/supabase/mappers";
import { createAnonServerClient } from "@/lib/supabase/server";
import type { ClaimedAlertRow } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

/**
 * Tells the right people about a new report.
 *
 *  1. Routing by role (people list): the reporter's foreman, the site's safety
 *     officers, and for high/critical incidents the HSE managers. Each person
 *     is told once per incident (notifications table).
 *  2. Statutory critical alert to SAFETY_ALERT_RECIPIENT, exactly once, via the
 *     claim_incident_alert RPC (cannot be forged or repeated).
 *
 * Trust model: with Supabase the body is only used for its incidentId; the
 * route reads the incident itself. A Supabase Database Webhook (protected by
 * ALERT_WEBHOOK_SECRET) may trigger it too. Without Supabase (demo mode) the
 * client payload is e-mailed to SAFETY_ALERT_RECIPIENT when critical.
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

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.SAFETY_ALERT_RECIPIENT;
  const from = process.env.RESEND_FROM ?? "SiteSafety Nordic <onboarding@resend.dev>";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const dashboardUrl = `${appUrl.replace(/\/$/, "")}/dashboard?incidentId=${encodeURIComponent(parsed.incidentId)}`;
  const language: Locale =
    body && typeof body === "object" && isLocale((body as { language?: string }).language)
      ? ((body as { language: Locale }).language)
      : "sv";

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Email alert environment is not configured." }, { status: 500 });
  }
  const resend = new Resend(apiKey);
  const result: { routed: number; critical: boolean; errors: string[] } = { routed: 0, critical: false, errors: [] };

  if (isSupabaseConfigured()) {
    // 1. Role-based routing
    try {
      result.routed = await routeByRole(resend, from, parsed.incidentId, language, dashboardUrl);
    } catch (caught) {
      result.errors.push(caught instanceof Error ? caught.message : "routing failed");
    }

    // 2. Statutory critical alert (once)
    const claimed = await claimIncident(parsed.incidentId);
    if (claimed === "error") {
      result.errors.push("Could not verify the incident.");
    } else if (claimed && recipient) {
      const email = buildCriticalIncidentEmail(claimed, dashboardUrl);
      const sent = await resend.emails.send({
        from,
        to: recipient.split(",").map((address) => address.trim()).filter(Boolean),
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (sent.error) result.errors.push(sent.error.message);
      else result.critical = true;
    }
    return NextResponse.json({ ok: result.errors.length === 0, ...result }, { status: result.errors.length ? 502 : 200 });
  }

  // Demo mode: only the statutory critical alert from the client payload.
  if (parsed.kind !== "client" || !parsed.payload) {
    return NextResponse.json({ ok: false, error: "Invalid alert payload." }, { status: 400 });
  }
  if (parsed.payload.severity !== "critical") {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }
  if (!recipient) {
    return NextResponse.json({ ok: false, error: "SAFETY_ALERT_RECIPIENT is not configured." }, { status: 500 });
  }
  const email = buildCriticalIncidentEmail(parsed.payload, dashboardUrl);
  const sent = await resend.emails.send({
    from,
    to: recipient.split(",").map((address) => address.trim()).filter(Boolean),
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (sent.error) return NextResponse.json({ ok: false, error: sent.error.message }, { status: 502 });
  return NextResponse.json({ ok: true, critical: true, id: sent.data?.id ?? null });
}

async function routeByRole(resend: Resend, from: string, incidentId: string, language: Locale, dashboardUrl: string) {
  const client = createAnonServerClient();
  const [recipients, incidentRows] = await Promise.all([
    client.rpc("incident_recipients", { p_incident_id: incidentId }),
    client.rpc("incident_for_notification", { p_incident_id: incidentId }),
  ]);
  if (recipients.error) throw recipients.error;
  if (incidentRows.error) throw incidentRows.error;
  const row = (Array.isArray(incidentRows.data) ? incidentRows.data[0] : incidentRows.data) ?? null;
  if (!row) return 0;

  const incident = {
    id: row.id,
    reference: row.reference,
    type: mapIncidentType(row.type),
    category: mapCategory(row.category),
    severity: mapSeverity(row.severity),
    description: row.description,
    summarySv: row.summary_sv,
    siteName: row.site_name,
    locationName: row.location_name,
    createdAt: row.created_at,
    reporterName: row.reporter_name,
    anonymous: row.is_anonymous,
  };

  let sentCount = 0;
  for (const person of recipients.data ?? []) {
    const reason = person.reason as RoutingReason;
    const email = buildRoutingEmail({ incident, reason, recipientName: person.full_name, language, dashboardUrl });
    void mapRole(person.role);
    // Log first (dedupes per incident + e-mail); only send when this is the first time.
    const logged = await client.rpc("log_notification", {
      p_incident_id: incidentId,
      p_profile_id: person.profile_id,
      p_email: person.email,
      p_reason: reason,
      p_email_id: null,
    });
    if (logged.error || logged.data !== true) continue;
    const sent = await resend.emails.send({ from, to: [person.email], subject: email.subject, html: email.html, text: email.text });
    if (!sent.error) sentCount += 1;
  }
  return sentCount;
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
