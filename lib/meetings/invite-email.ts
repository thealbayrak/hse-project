import { LOCALE_TAGS, translate, type Locale } from "@/lib/i18n/translations";
import { categoryLabel, severityLabel, typeLabel } from "@/lib/format";
import type { Incident, MeetingInviteInput } from "@/lib/types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function list(items: string[]) {
  return items.length ? `<ul style="margin:6px 0 0;padding-left:18px;">${items.map((item) => `<li style="margin:2px 0;">${escapeHtml(item)}</li>`).join("")}</ul>` : "";
}

function section(title: string, body: string) {
  if (!body) return "";
  return `<tr><td style="padding:12px 24px;border-top:1px solid #e2e8f0;"><p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;">${escapeHtml(title)}</p><div style="font-size:14px;line-height:1.5;color:#0f172a;">${body}</div></td></tr>`;
}

export function buildMeetingEmail(input: {
  meeting: MeetingInviteInput;
  incident: Incident;
  language: Locale;
  dashboardUrl: string;
  organizer: { name: string; email: string };
}) {
  const { meeting, incident, language, dashboardUrl } = input;
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const when = new Intl.DateTimeFormat(LOCALE_TAGS[language], {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(meeting.scheduledAt));
  const analysis = incident.aiAnalysis;

  const details = `
    <p style="margin:0;"><strong>${escapeHtml(t("meeting.when"))}:</strong> ${escapeHtml(when)} (Europe/Stockholm) · ${meeting.durationMinutes} min</p>
    ${meeting.location ? `<p style="margin:4px 0 0;"><strong>${escapeHtml(t("meeting.location"))}:</strong> ${escapeHtml(meeting.location)}</p>` : ""}
    ${meeting.note ? `<p style="margin:8px 0 0;white-space:pre-line;">${escapeHtml(meeting.note)}</p>` : ""}`;

  const incidentBody = `
    <p style="margin:0;"><strong>${escapeHtml(incident.reference)}</strong> · ${escapeHtml(typeLabel(incident.type, language))} · ${escapeHtml(categoryLabel(incident.category, language))} · ${escapeHtml(severityLabel(incident.severity, language))}</p>
    <p style="margin:4px 0 0;">${escapeHtml(incident.locationName ?? incident.locationId)} · ${escapeHtml(incident.siteName ?? incident.siteId)}</p>
    ${incident.summarySv ? `<p style="margin:8px 0 0;"><em>${escapeHtml(incident.summarySv)}</em></p>` : ""}
    <p style="margin:8px 0 0;white-space:pre-line;">${escapeHtml(incident.originalText || incident.description)}</p>`;

  const analysisBody = analysis
    ? `
    <p style="margin:0;">${escapeHtml(analysis.summary)}</p>
    <p style="margin:8px 0 0;"><strong>${escapeHtml(t("analysis.risk"))}:</strong> ${escapeHtml(severityLabel(analysis.riskLevel, language))} · <strong>${escapeHtml(t("analysis.aml"))}:</strong> ${escapeHtml(analysis.amlReportRequired ? t("analysis.amlYes") : t("analysis.amlNo"))}${analysis.amlReason ? ` — ${escapeHtml(analysis.amlReason)}` : ""}</p>
    <p style="margin:8px 0 0;"><strong>${escapeHtml(t("analysis.rootCauses"))}</strong></p>${list(analysis.rootCauses)}
    <p style="margin:8px 0 0;"><strong>${escapeHtml(t("analysis.immediate"))}</strong></p>${list(analysis.immediateActions)}
    <p style="margin:8px 0 0;"><strong>${escapeHtml(t("analysis.preventive"))}</strong></p>${list(analysis.preventiveActions)}
    ${analysis.meetingAgenda.length ? `<p style="margin:8px 0 0;"><strong>${escapeHtml(t("analysis.agenda"))}</strong></p>${list(analysis.meetingAgenda)}` : ""}
    <p style="margin:8px 0 0;font-size:12px;color:#64748b;">${escapeHtml(t("analysis.disclaimer"))}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="${language}">
  <head><meta charset="utf-8" /><title>${escapeHtml(meeting.title)}</title></head>
  <body style="margin:0;padding:16px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#991b1b;padding:20px 24px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;font-weight:700;color:#fecaca;">SITESAFETY NORDIC · ${escapeHtml(t("meeting.title").toUpperCase())}</p>
        <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;">${escapeHtml(meeting.title)}</h1>
      </td></tr>
      ${section(t("meeting.title"), details)}
      ${section(t("dashboard.feed"), incidentBody)}
      ${section(t("analysis.title"), analysisBody)}
      <tr><td style="padding:20px 24px;border-top:1px solid #e2e8f0;text-align:center;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">${escapeHtml(t("nav.dashboard"))} →</a>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    meeting.title,
    "",
    `${t("meeting.when")}: ${when} (Europe/Stockholm) · ${meeting.durationMinutes} min`,
    meeting.location ? `${t("meeting.location")}: ${meeting.location}` : "",
    meeting.note ? `\n${meeting.note}` : "",
    "",
    `${incident.reference} · ${typeLabel(incident.type, language)} · ${categoryLabel(incident.category, language)} · ${severityLabel(incident.severity, language)}`,
    `${incident.locationName ?? incident.locationId} · ${incident.siteName ?? incident.siteId}`,
    incident.summarySv ?? "",
    incident.originalText || incident.description,
    analysis
      ? [
          "",
          `${t("analysis.title")}: ${analysis.summary}`,
          `${t("analysis.risk")}: ${severityLabel(analysis.riskLevel, language)}`,
          `${t("analysis.aml")}: ${analysis.amlReportRequired ? t("analysis.amlYes") : t("analysis.amlNo")} ${analysis.amlReason}`,
          `${t("analysis.rootCauses")}: ${analysis.rootCauses.join("; ")}`,
          `${t("analysis.immediate")}: ${analysis.immediateActions.join("; ")}`,
          `${t("analysis.preventive")}: ${analysis.preventiveActions.join("; ")}`,
          analysis.meetingAgenda.length ? `${t("analysis.agenda")}: ${analysis.meetingAgenda.join("; ")}` : "",
        ].join("\n")
      : "",
    "",
    dashboardUrl,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject: meeting.title, html, text };
}
