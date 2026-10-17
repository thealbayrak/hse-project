import { NextResponse } from "next/server";
import { Resend } from "resend";
import { isLocale, type Locale } from "@/lib/i18n/translations";
import { buildIcs } from "@/lib/meetings/ics";
import { buildMeetingEmail } from "@/lib/meetings/invite-email";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Incident, MeetingInviteInput } from "@/lib/types";

export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Body {
  meeting?: Partial<MeetingInviteInput>;
  incident?: Incident;
  language?: string;
}

/**
 * Sends an emergency-meeting invitation (e-mail + .ics) about one incident to
 * the chosen participants and records it. Requires a signed-in safety officer
 * when Supabase is configured; the incident snapshot comes from the client,
 * which already holds it under RLS.
 */
export async function POST(request: Request) {
  let organizerEmail = process.env.RESEND_FROM?.match(/<([^>]+)>/)?.[1] ?? "onboarding@resend.dev";
  let organizerName = "SiteSafety Nordic";
  let userId: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in to send invitations." }, { status: 401 });
    }
    userId = user.id;
    if (user.email) organizerName = user.email;
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const incident = body.incident;
  const raw = body.meeting ?? {};
  const language: Locale = isLocale(body.language) ? body.language : "sv";
  if (!incident || typeof incident.reference !== "string") {
    return NextResponse.json({ ok: false, error: "Incident is required." }, { status: 400 });
  }

  const recipients = (Array.isArray(raw.recipients) ? raw.recipients : [])
    .filter((item): item is { name: string; email: string } => Boolean(item) && typeof item.email === "string" && EMAIL.test(item.email))
    .map((item) => ({ name: (item.name || item.email).slice(0, 120), email: item.email.trim().toLowerCase() }))
    .slice(0, 50);
  const scheduledAt = typeof raw.scheduledAt === "string" ? new Date(raw.scheduledAt) : new Date(NaN);
  if (!recipients.length) {
    return NextResponse.json({ ok: false, error: "Choose at least one participant." }, { status: 400 });
  }
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ ok: false, error: "A valid date and time is required." }, { status: 400 });
  }

  const meeting: MeetingInviteInput = {
    incidentId: incident.id,
    title: (typeof raw.title === "string" && raw.title.trim()) || `Emergency meeting · ${incident.reference}`,
    scheduledAt: scheduledAt.toISOString(),
    durationMinutes: Math.min(480, Math.max(10, Number(raw.durationMinutes) || 30)),
    location: typeof raw.location === "string" ? raw.location.slice(0, 300) : "",
    note: typeof raw.note === "string" ? raw.note.slice(0, 2000) : "",
    recipients,
  };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "SiteSafety Nordic <onboarding@resend.dev>";
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Email is not configured (RESEND_API_KEY)." }, { status: 500 });
  }
  organizerEmail = from.match(/<([^>]+)>/)?.[1] ?? from;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const dashboardUrl = `${appUrl.replace(/\/$/, "")}/dashboard?incidentId=${encodeURIComponent(incident.id)}`;

  const email = buildMeetingEmail({
    meeting,
    incident,
    language,
    dashboardUrl,
    organizer: { name: organizerName, email: organizerEmail },
  });
  const uid = `${crypto.randomUUID()}@sitesafety-nordic`;
  const ics = buildIcs({
    uid,
    start: scheduledAt,
    durationMinutes: meeting.durationMinutes,
    summary: meeting.title,
    description: email.text,
    location: meeting.location || undefined,
    organizer: { name: organizerName, email: organizerEmail },
    attendees: recipients,
    url: dashboardUrl,
  });

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: recipients.map((item) => item.email),
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [{ filename: "emergency-meeting.ics", content: Buffer.from(ics, "utf8").toString("base64"), contentType: "text/calendar; method=REQUEST" }],
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    }

    if (isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      await supabase.from("meetings").insert({
        incident_id: incident.id,
        title: meeting.title,
        scheduled_at: meeting.scheduledAt,
        duration_minutes: meeting.durationMinutes,
        location: meeting.location || null,
        note: meeting.note || null,
        recipients,
        created_by: userId,
        email_id: data?.id ?? null,
      });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null, recipients: recipients.length });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not send the invitation.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
