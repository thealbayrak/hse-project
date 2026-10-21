import { translate, type Locale } from "@/lib/i18n/translations";
import { categoryLabel, severityLabel, typeLabel } from "@/lib/format";
import type { IncidentType, RiskCategory, Severity } from "@/lib/types";

export interface RoutedIncident {
  id: string;
  reference: string;
  type: IncidentType;
  category: RiskCategory;
  severity: Severity;
  description: string;
  summarySv: string | null;
  siteName: string;
  locationName: string;
  createdAt: string;
  reporterName: string | null;
  anonymous: boolean;
  /** What the reporter answered; severity itself is rated later by a manager. */
  hurt?: boolean | null;
  dangerPresent?: boolean | null;
}

export type RoutingReason = "foreman" | "site_officer" | "escalation";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const SEVERITY_COLOR: Record<Severity, string> = {
  unrated: "#7c3aed",
  low: "#059669",
  medium: "#d97706",
  high: "#ea580c",
  critical: "#dc2626",
};

/**
 * The e-mail a foreman, site safety officer or HSE manager gets when a report
 * comes in. Short, in the recipient's language, with the Swedish summary.
 */
export function buildRoutingEmail(input: {
  incident: RoutedIncident;
  reason: RoutingReason;
  recipientName: string;
  language: Locale;
  dashboardUrl: string;
}) {
  const { incident, reason, recipientName, language, dashboardUrl } = input;
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const severity = severityLabel(incident.severity, language);
  const type = typeLabel(incident.type, language);
  const category = categoryLabel(incident.category, language);
  const reasonText = t(`routing.${reason}`);
  const subject = `[${severity}] ${type} · ${incident.siteName} · ${incident.reference}`;
  const facts = [
    incident.hurt === true ? t("routing.hurtYes") : null,
    incident.dangerPresent === true ? t("routing.dangerYes") : null,
  ].filter((line): line is string => Boolean(line));

  const html = `<!DOCTYPE html>
<html lang="${language}">
  <head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:16px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:${SEVERITY_COLOR[incident.severity]};padding:18px 24px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;font-weight:700;opacity:.85;">SITESAFETY NORDIC · ${escapeHtml(t("routing.newReport").toUpperCase())}</p>
        <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;">${escapeHtml(type)} · ${escapeHtml(severity)}</h1>
        <p style="margin:6px 0 0;font-size:14px;opacity:.9;">${escapeHtml(incident.siteName)} · ${escapeHtml(incident.locationName)}</p>
      </td></tr>
      <tr><td style="padding:16px 24px;font-size:14px;line-height:1.5;color:#0f172a;">
        <p style="margin:0 0 10px;">${escapeHtml(t("routing.hello", { name: recipientName }))} ${escapeHtml(reasonText)}</p>
        <p style="margin:0;"><strong>${escapeHtml(incident.reference)}</strong> · ${escapeHtml(category)}${incident.anonymous ? ` · ${escapeHtml(t("report.anonymousPerson"))}` : incident.reporterName ? ` · ${escapeHtml(incident.reporterName)}` : ""}</p>
        ${incident.summarySv ? `<p style="margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-left:3px solid ${SEVERITY_COLOR[incident.severity]};"><em>${escapeHtml(incident.summarySv)}</em></p>` : ""}
        <p style="margin:10px 0 0;white-space:pre-line;">${escapeHtml(incident.description)}</p>
        ${facts.length ? `<p style="margin:12px 0 0;padding:10px 12px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:8px;font-weight:700;">${facts.map(escapeHtml).join(" · ")}</p>` : ""}
        ${incident.severity === "critical" ? `<p style="margin:12px 0 0;padding:10px 12px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:8px;">${escapeHtml(t("statutory.aml"))}</p>` : ""}
      </td></tr>
      <tr><td style="padding:0 24px 20px;text-align:center;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">${escapeHtml(t("routing.open"))} →</a>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    subject,
    "",
    `${t("routing.hello", { name: recipientName })} ${reasonText}`,
    `${incident.reference} · ${category}`,
    `${incident.siteName} · ${incident.locationName}`,
    facts.join(" · "),
    incident.summarySv ?? "",
    incident.description,
    "",
    dashboardUrl,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}
