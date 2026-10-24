import { escapeHtml, formatDue } from "@/lib/alerts/assignment-email";
import { translate, type Locale } from "@/lib/i18n/translations";

/** Things other than a report that a person can be given: a task, a checklist round, or an area to look after. */
export type WorkKind = "task" | "audit" | "area";

/** The e-mail a person gets the moment they are given a task, a checklist or an area. */
export function buildWorkEmail(input: {
  kind: WorkKind;
  recipientName: string;
  assignedBy: string | null;
  /** The task title, the checklist name, or the area. */
  title: string;
  /** Free text under the title (task description), when there is any. */
  detail: string | null;
  place: string | null;
  dueDate: string | null;
  /** Shown as given (for example "High"), when there is one. */
  priority: string | null;
  language: Locale;
  url: string;
}) {
  const { kind, recipientName, assignedBy, title, detail, place, dueDate, priority, language, url } = input;
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const due = formatDue(dueDate, language);
  const subject = t(`workmail.subject_${kind}`, { title });
  const intro = assignedBy ? t(`workmail.introBy_${kind}`, { by: assignedBy }) : t(`workmail.intro_${kind}`);

  const html = `<!DOCTYPE html>
<html lang="${language}">
  <head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:16px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:18px 24px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;font-weight:700;color:#fbbf24;">SITESAFETY NORDIC · ${escapeHtml(t(`workmail.badge_${kind}`).toUpperCase())}</p>
        <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;">${escapeHtml(title)}</h1>
        ${place ? `<p style="margin:6px 0 0;font-size:14px;opacity:.85;">${escapeHtml(place)}</p>` : ""}
      </td></tr>
      <tr><td style="padding:16px 24px;font-size:14px;line-height:1.5;color:#0f172a;">
        <p style="margin:0 0 10px;">${escapeHtml(t("routing.hello", { name: recipientName }))} ${escapeHtml(intro)}</p>
        ${priority ? `<p style="margin:0;"><strong>${escapeHtml(t("workmail.priority"))}:</strong> ${escapeHtml(priority)}</p>` : ""}
        ${due ? `<p style="margin:10px 0 0;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-weight:700;">${escapeHtml(t("assignment.due", { date: due }))}</p>` : ""}
        ${detail ? `<p style="margin:10px 0 0;white-space:pre-line;">${escapeHtml(detail)}</p>` : ""}
      </td></tr>
      <tr><td style="padding:0 24px 20px;text-align:center;">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">${escapeHtml(t("workmail.open"))} →</a>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    subject,
    "",
    `${t("routing.hello", { name: recipientName })} ${intro}`,
    title,
    place ?? "",
    priority ? `${t("workmail.priority")}: ${priority}` : "",
    due ? t("assignment.due", { date: due }) : "",
    detail ?? "",
    "",
    url,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}
