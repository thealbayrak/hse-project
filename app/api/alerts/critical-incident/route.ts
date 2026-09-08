import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildCriticalIncidentEmail } from "@/lib/alerts/critical-incident-email";
import type { CriticalIncidentAlertPayload } from "@/lib/alerts/critical-incident";
import type { IncidentType, RiskCategory, Severity } from "@/lib/types";

export const runtime = "nodejs";

const INCIDENT_TYPES: IncidentType[] = ["near-miss", "hazard", "accident"];
const CATEGORIES: RiskCategory[] = [
  "falls",
  "machine",
  "falling-objects",
  "slip-trip",
  "chemical",
  "electrical",
  "ergonomic",
];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

function isIncidentType(value: unknown): value is IncidentType {
  return typeof value === "string" && INCIDENT_TYPES.includes(value as IncidentType);
}

function isCategory(value: unknown): value is RiskCategory {
  return typeof value === "string" && CATEGORIES.includes(value as RiskCategory);
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && SEVERITIES.includes(value as Severity);
}

function parsePayload(body: unknown): CriticalIncidentAlertPayload | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (typeof value.incidentId !== "string" || !value.incidentId) return null;
  if (!isIncidentType(value.type)) return null;
  if (!isCategory(value.category)) return null;
  if (!isSeverity(value.severity)) return null;
  if (typeof value.title !== "string") return null;
  if (typeof value.description !== "string") return null;
  if (typeof value.siteName !== "string") return null;
  if (typeof value.specificLocation !== "string") return null;
  if (typeof value.occurredAt !== "string") return null;

  return {
    incidentId: value.incidentId,
    type: value.type,
    category: value.category,
    severity: value.severity,
    title: value.title,
    description: value.description,
    siteName: value.siteName,
    specificLocation: value.specificLocation,
    occurredAt: value.occurredAt,
    requiresArbetsmiljoverketReport: Boolean(value.requiresArbetsmiljoverketReport),
  };
}

export async function POST(request: Request) {
  let payload: CriticalIncidentAlertPayload | null = null;
  try {
    payload = parsePayload(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!payload) {
    return NextResponse.json({ ok: false, error: "Invalid alert payload." }, { status: 400 });
  }

  if (payload.severity !== "critical" && payload.requiresArbetsmiljoverketReport !== true) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
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
      to: recipient,
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
