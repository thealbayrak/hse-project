import { severityLabel, typeLabel } from "@/lib/format";
import { translate, type Locale } from "@/lib/i18n/translations";
import type { IncidentType, Severity } from "@/lib/types";

export interface AssignedIncident {
  reference: string;
  type: IncidentType;
  typeNote?: string | null;
  severity: Severity;
  description: string;
  summarySv: string | null;
  siteName: string;
  locationName: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** "2026-11-03" → readable date in the recipient's language; anything else is shown as given. */
function formatDue(value: string | null, language: Locale) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value ?? "";
  const tag = language === "sv" ? "sv-SE" : language === "tr" ? "tr-TR" : "en-GB";
  return new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

/** The e-mail an action owner gets when a report is assigned to them. */
export function buildAssignmentEmail(input: {
  incident: AssignedIncident;
  recipientName: string;
  assignedBy: string | null;
  dueDate: string | null;
  note: string | null;
  language: Locale;
  dashboardUrl: string;
}) {
  const { incident, recipientName, assignedBy, dueDate, note, language, dashboardUrl } = input;
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const type = typeLabel(incident.type, language, incident.typeNote);
  const severity = severityLabel(incident.severity, language);
  const due = formatDue(dueDate, language);
  const subject = t("assignment.subject", { reference: incident.reference });
  const intro = assignedBy ? t("assignment.introBy", { by: assignedBy }) : t("assignment.intro");

  const html = `<!DOCTYPE html>
<html lang="${language}">
  <head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:16px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:18px 24px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;font-weight:700;color:#fbbf24;">SITESAFETY NORDIC · ${escapeHtml(t("assignment.badge").toUpperCase())}</p>
        <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;">${escapeHtml(t("assignment.title"))}</h1>
        <p style="margin:6px 0 0;font-size:14px;opacity:.85;">${escapeHtml(incident.siteName)} · ${escapeHtml(incident.locationName)}</p>
      </td></tr>
      <tr><td style="padding:16px 24px;font-size:14px;line-height:1.5;color:#0f172a;">
        <p style="margin:0 0 10px;">${escapeHtml(t("routing.hello", { name: recipientName }))} ${escapeHtml(intro)}</p>
        <p style="margin:0;"><strong>${escapeHtml(incident.reference)}</strong> · ${escapeHtml(type)} · ${escapeHtml(severity)}</p>
        ${due ? `<p style="margin:10px 0 0;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-weight:700;">${escapeHtml(t("assignment.due", { date: due }))}</p>` : ""}
        ${incident.summarySv ? `<p style="margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-left:3px solid #f59e0b;"><em>${escapeHtml(incident.summarySv)}</em></p>` : ""}
        <p style="margin:10px 0 0;white-space:pre-line;">${escapeHtml(incident.description)}</p>
        ${note ? `<p style="margin:10px 0 0;white-space:pre-line;"><strong>${escapeHtml(t("assignment.note"))}</strong> ${escapeHtml(note)}</p>` : ""}
      </td></tr>
      <tr><td style="padding:0 24px 20px;text-align:center;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">${escapeHtml(t("assignment.open"))} →</a>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    subject,
    "",
    `${t("routing.hello", { name: recipientName })} ${intro}`,
    `${incident.reference} · ${type} · ${severity}`,
    `${incident.siteName} · ${incident.locationName}`,
    due ? t("assignment.due", { date: due }) : "",
    incident.summarySv ?? "",
    incident.description,
    note ? `${t("assignment.note")} ${note}` : "",
    "",
    dashboardUrl,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}
