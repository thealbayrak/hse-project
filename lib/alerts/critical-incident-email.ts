import { categoryLabel, typeLabel } from "@/lib/format";
import type { CriticalIncidentAlertPayload } from "@/lib/alerts/critical-incident";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatOccurredAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(date);
}

export function buildCriticalIncidentEmail(payload: CriticalIncidentAlertPayload, dashboardUrl: string) {
  const type = typeLabel(payload.type);
  const category = categoryLabel(payload.category);
  const occurredAt = formatOccurredAt(payload.occurredAt);
  const title = escapeHtml(payload.title);
  const siteName = escapeHtml(payload.siteName);
  const location = escapeHtml(payload.specificLocation);
  const description = escapeHtml(payload.description).replaceAll("\n", "<br />");
  const safeUrl = escapeHtml(dashboardUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CRITICAL SAFETY ALERT - AML 3:3a</title>
  </head>
  <body style="margin:0;padding:0;background:#0f172a;color:#e2e8f0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#991b1b;padding:20px 24px;text-align:center;">
                <p style="margin:0;font-size:11px;letter-spacing:0.18em;color:#fecaca;font-weight:700;">SITESAFETY NORDIC · SAM</p>
                <h1 style="margin:8px 0 0;font-size:22px;line-height:1.2;color:#ffffff;font-weight:800;">CRITICAL SAFETY ALERT - AML 3:3a</h1>
                <p style="margin:8px 0 0;font-size:14px;color:#fee2e2;">${title}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#7f1d1d;border:1px solid #f87171;border-radius:10px;">
                  <tr>
                    <td style="padding:14px 16px;color:#fee2e2;font-size:13px;line-height:1.5;">
                      <strong style="color:#fecaca;">AML 3 kap. 3 a §</strong> — Allvarliga tillbud och olycksfall ska utan dröjsmål anmälas till Arbetsmiljöverket. Severe tillbud and accidents must be notified to Arbetsmiljöverket without delay.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 20px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#94a3b8;width:42%;">Site name</td>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#f8fafc;font-weight:700;">${siteName}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#94a3b8;">Specific location</td>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#f8fafc;font-weight:700;">${location}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#94a3b8;">Incident type</td>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#f8fafc;font-weight:700;">${escapeHtml(type)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#94a3b8;">Category</td>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#f8fafc;font-weight:700;">${escapeHtml(category)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#94a3b8;">Timestamp</td>
                    <td style="padding:10px 0;border-bottom:1px solid #334155;color:#f8fafc;font-weight:700;">${escapeHtml(occurredAt)} (Europe/Stockholm)</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;color:#94a3b8;">Severity</td>
                    <td style="padding:10px 0;color:#fca5a5;font-weight:800;text-transform:uppercase;">${escapeHtml(payload.severity)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 20px 20px;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;color:#94a3b8;font-weight:700;">WORKER DESCRIPTION</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;">
                  <tr>
                    <td style="padding:14px 16px;color:#e2e8f0;font-size:15px;line-height:1.55;font-style:italic;">
                      “${description}”
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 20px 28px;">
                <a href="${safeUrl}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:800;font-size:16px;padding:16px 28px;border-radius:10px;min-width:220px;">
                  Open incident in dashboard
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 20px;color:#64748b;font-size:11px;line-height:1.5;">
                This alert was generated automatically by SiteSafety Nordic. Treat it as an internal trigger for immediate site control and, where required, statutory reporting to Arbetsmiljöverket.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "CRITICAL SAFETY ALERT - AML 3:3a",
    payload.title,
    "AML 3 kap. 3 a § — Allvarliga tillbud och olycksfall ska utan dröjsmål anmälas till Arbetsmiljöverket. Severe tillbud and accidents must be notified to Arbetsmiljöverket without delay.",
    `Site: ${payload.siteName}`,
    `Location: ${payload.specificLocation}`,
    `Type: ${type}`,
    `Category: ${category}`,
    `When: ${occurredAt}`,
    "",
    payload.description,
    "",
    `Open: ${dashboardUrl}`,
  ].join("\n");

  return { html, text, subject: `CRITICAL SAFETY ALERT - AML 3:3a — ${payload.title}` };
}
