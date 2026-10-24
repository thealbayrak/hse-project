import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildWorkEmail, type WorkKind } from "@/lib/alerts/work-email";
import { isLocale, type Locale } from "@/lib/i18n/translations";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  kind?: string;
  /** Task id, checklist (audit) id, or the id of the area. */
  id?: string;
  assigneeId?: string;
  language?: string;
}

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * E-mails a person who was just given a task, a checklist round or an area.
 * Everything is read with the caller's own session, and the person named must
 * really be the one on that row, so this cannot be used to mail someone else.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return reply({ ok: true, sent: false, reason: "demo" });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return reply({ ok: false, error: "Invalid JSON body." }, 400);
  }
  const kind = body.kind as WorkKind;
  if (!["task", "audit", "area"].includes(kind) || !body.id || !body.assigneeId) {
    return reply({ ok: false, error: "kind, id and assigneeId are required." }, 400);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return reply({ ok: false, error: "Sign in first." }, 401);

  let title = "";
  let detail: string | null = null;
  let dueDate: string | null = null;
  let priority: string | null = null;
  let siteId: string | null = null;
  let place: string | null = null;
  let page = "/tasks";

  if (kind === "task") {
    const row = await supabase.from("tasks").select("title, description, priority, due_date, site_id, assignee_id").eq("id", body.id).maybeSingle();
    if (row.error || !row.data || row.data.assignee_id !== body.assigneeId) return reply({ ok: false, error: "Task not found." }, 404);
    title = row.data.title;
    detail = row.data.description || null;
    dueDate = row.data.due_date;
    priority = row.data.priority;
    siteId = row.data.site_id;
  } else if (kind === "audit") {
    const row = await supabase.from("audits").select("template_name, due_date, site_id, assignee_id").eq("id", body.id).maybeSingle();
    if (row.error || !row.data || row.data.assignee_id !== body.assigneeId) return reply({ ok: false, error: "Checklist not found." }, 404);
    title = row.data.template_name;
    dueDate = row.data.due_date;
    siteId = row.data.site_id;
    page = "/audits";
  } else {
    const mine = await supabase.from("area_responsibles").select("location_id, profile_id").eq("location_id", body.id).maybeSingle();
    if (mine.error || !mine.data || mine.data.profile_id !== body.assigneeId) return reply({ ok: false, error: "Area not found." }, 404);
    const location = await supabase.from("site_locations").select("name, site_id").eq("id", body.id).maybeSingle();
    if (location.error || !location.data) return reply({ ok: false, error: "Area not found." }, 404);
    title = location.data.name;
    siteId = location.data.site_id;
    page = "/dashboard/area";
  }

  if (siteId) {
    const site = await supabase.from("sites").select("name").eq("id", siteId).maybeSingle();
    place = site.data?.name ?? null;
  }

  const [assignee, me] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, language").eq("id", body.assigneeId).maybeSingle(),
    supabase.rpc("current_profile"),
  ]);
  if (assignee.error || !assignee.data) return reply({ ok: false, error: "Person not found." }, 404);
  const email = assignee.data.email?.trim();
  if (!email) return reply({ ok: true, sent: false, reason: "no-email" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return reply({ ok: false, sent: false, reason: "not-configured", error: "E-mail is not configured." }, 500);

  const language: Locale = isLocale(assignee.data.language) ? (assignee.data.language as Locale) : isLocale(body.language) ? (body.language as Locale) : "sv";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const assignedBy = me.data && typeof me.data === "object" && "full_name" in me.data ? String(me.data.full_name ?? "") || null : null;

  const message = buildWorkEmail({
    kind,
    recipientName: assignee.data.full_name,
    assignedBy,
    title,
    detail,
    place,
    dueDate,
    priority,
    language,
    url: `${appUrl.replace(/\/$/, "")}${page}`,
  });

  const from = process.env.RESEND_FROM ?? "SiteSafety Nordic <onboarding@resend.dev>";
  const sent = await new Resend(apiKey).emails.send({ from, to: [email], subject: message.subject, html: message.html, text: message.text });
  if (sent.error) return reply({ ok: false, sent: false, reason: "send-failed", error: sent.error.message }, 502);

  await supabase
    .from("notifications")
    .insert({ incident_id: null, recipient_profile_id: assignee.data.id, recipient_email: email.toLowerCase(), reason: `${kind}_assigned`, email_id: sent.data?.id ?? null })
    .then(() => undefined, () => undefined);

  return reply({ ok: true, sent: true });
}
