import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildAssignmentEmail, type AssignmentRole } from "@/lib/alerts/assignment-email";
import { isLocale, type Locale } from "@/lib/i18n/translations";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mapIncidentType, mapSeverity } from "@/lib/supabase/mappers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  incidentId?: string;
  assigneeId?: string;
  role?: string;
  dueDate?: string | null;
  note?: string | null;
  language?: string;
}

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * E-mails a newly assigned action owner. Everything is read with the caller's
 * own session, so row level security decides whether they may see the report
 * and the person; nothing from the body is trusted except the two ids.
 */
export async function POST(request: Request) {
  // Demo mode has no accounts to mail.
  if (!isSupabaseConfigured()) return reply({ ok: true, sent: false, reason: "demo" });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return reply({ ok: false, error: "Invalid JSON body." }, 400);
  }
  if (!body.incidentId || !body.assigneeId) return reply({ ok: false, error: "incidentId and assigneeId are required." }, 400);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return reply({ ok: false, error: "Sign in first." }, 401);

  // Access check through RLS: the caller must be able to read this report.
  const visible = await supabase.from("incidents").select("id").eq("id", body.incidentId).maybeSingle();
  if (visible.error || !visible.data) return reply({ ok: false, error: "Report not found." }, 404);

  const [assignee, me, details] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, language").eq("id", body.assigneeId).maybeSingle(),
    supabase.rpc("current_profile"),
    supabase.rpc("incident_for_notification", { p_incident_id: body.incidentId }),
  ]);
  if (assignee.error || !assignee.data) return reply({ ok: false, error: "Person not found." }, 404);
  const row = Array.isArray(details.data) ? details.data[0] : details.data;
  if (details.error || !row) return reply({ ok: false, error: "Report not found." }, 404);

  const email = assignee.data.email?.trim();
  if (!email) return reply({ ok: true, sent: false, reason: "no-email" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return reply({ ok: false, sent: false, reason: "not-configured", error: "E-mail is not configured." }, 500);

  const language: Locale = isLocale(assignee.data.language)
    ? (assignee.data.language as Locale)
    : isLocale(body.language)
      ? (body.language as Locale)
      : "sv";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const role: AssignmentRole =
    body.role === "investigator" || body.role === "follow_up" || body.role === "follow_up_ready" ? body.role : "action_owner";
  const page = role === "investigator" ? "/dashboard/investigations" : role === "action_owner" ? "/dashboard/my-actions" : "/dashboard/follow-ups";

  // The person must really be on the report in that role: this route cannot be used to mail anyone else.
  const onReport = await supabase
    .from("assignments")
    .select("action_owner_id, investigator_id, follow_up_id")
    .eq("incident_id", body.incidentId)
    .maybeSingle();
  const named = role === "investigator" ? onReport.data?.investigator_id : role === "action_owner" ? onReport.data?.action_owner_id : onReport.data?.follow_up_id;
  if (onReport.error || named !== body.assigneeId) return reply({ ok: false, error: "That person is not on this report." }, 403);
  const dashboardUrl = `${appUrl.replace(/\/$/, "")}${page}?incidentId=${encodeURIComponent(body.incidentId)}`;
  const assignedBy = me.data && typeof me.data === "object" && "full_name" in me.data ? String(me.data.full_name ?? "") || null : null;

  const message = buildAssignmentEmail({
    role,
    incident: {
      reference: row.reference,
      type: mapIncidentType(row.type),
      severity: mapSeverity(row.severity),
      description: row.description,
      summarySv: row.summary_sv,
      siteName: row.site_name,
      locationName: row.location_name,
    },
    recipientName: assignee.data.full_name,
    assignedBy,
    dueDate: typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null,
    language,
    dashboardUrl,
  });

  const from = process.env.RESEND_FROM ?? "SiteSafety Nordic <onboarding@resend.dev>";
  const sent = await new Resend(apiKey).emails.send({ from, to: [email], subject: message.subject, html: message.html, text: message.text });
  if (sent.error) return reply({ ok: false, sent: false, reason: "send-failed", error: sent.error.message }, 502);

  // Audit trail; a failure here must not undo a delivered e-mail.
  await supabase
    .from("notifications")
    .insert({
      incident_id: body.incidentId,
      recipient_profile_id: assignee.data.id,
      recipient_email: email.toLowerCase(),
      reason: "assigned",
      email_id: sent.data?.id ?? null,
    })
    .then(() => undefined, () => undefined);

  return reply({ ok: true, sent: true });
}
