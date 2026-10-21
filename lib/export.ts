import {
  categoriesLabel,
  csvEscape,
  formatDateTime,
  locationLabel,
  severityLabel,
  siteLabel,
  statusLabel,
  typeLabel,
} from "@/lib/format";
import { translate, type Locale } from "@/lib/i18n/translations";
import { incidentCategories, type AiReport, type DashboardMetrics, type Incident } from "@/lib/types";

function siteName(incident: Incident) {
  return incident.siteName || siteLabel(incident.siteId);
}

function locationName(incident: Incident) {
  return incident.locationName || (incident.locationId ? locationLabel(incident.siteId, incident.locationId) : siteName(incident));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** One flat row per incident, shared by CSV, Excel and PDF. */
export function incidentRows(incidents: Incident[], locale: Locale = "en") {
  const t = (key: string) => translate(locale, key);
  const header = [
    t("export.reference"),
    t("export.date"),
    t("export.type"),
    t("export.site"),
    t("export.area"),
    t("export.risk"),
    t("export.severity"),
    t("export.status"),
    t("export.reporter"),
    t("export.owner"),
    t("export.dueDate"),
    t("export.notes"),
    t("export.description"),
    t("export.summary"),
    t("export.subcontractor"),
    t("export.hurt"),
  ];
  const rows = incidents.map((incident) => [
    incident.reference,
    formatDateTime(incident.createdAt, locale),
    typeLabel(incident.type, locale, incident.typeNote),
    siteName(incident),
    locationName(incident),
    categoriesLabel(incidentCategories(incident), locale),
    severityLabel(incident.severity, locale),
    statusLabel(incident.status, locale),
    incident.anonymous ? t("report.anonymousPerson") : (incident.reporterName ?? ""),
    incident.capa?.assigneeName ?? "",
    incident.capa?.dueDate ?? "",
    incident.capa?.notes ?? "",
    incident.description,
    incident.summarySv ?? "",
    incident.subcontractor ?? "",
    incident.hurt === true ? t("buttons.yes") : incident.hurt === false ? t("buttons.no") : "",
  ]);
  return { header, rows };
}

export function downloadIncidentsCsv(incidents: Incident[], locale: Locale = "en") {
  const { header, rows } = incidentRows(incidents, locale);
  const lines = rows.map((row) => row.map((value) => csvEscape(String(value))).join(","));
  // BOM so Excel opens Swedish and Turkish characters correctly.
  const blob = new Blob(["﻿", [header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, `sitesafety-nordic-summary-${stamp()}.csv`);
}

/** A real .xlsx workbook (one sheet of incidents, one of totals) for analysis in Excel. */
export async function downloadIncidentsXlsx(incidents: Incident[], metrics: DashboardMetrics, locale: Locale = "en") {
  const XLSX = await import("xlsx");
  const { header, rows } = incidentRows(incidents, locale);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = header.map((_, index) => ({ wch: index === 12 || index === 13 ? 60 : index === 11 ? 32 : 18 }));
  const t = (key: string) => translate(locale, key);
  const totals = XLSX.utils.aoa_to_sheet([
    [t("dashboard.totalReports"), metrics.totalReports],
    [t("dashboard.openActions"), metrics.openActions],
    [t("dashboard.criticalNear"), metrics.criticalNearMisses],
    [t("dashboard.daysFree"), metrics.daysIncidentFree],
    [t("export.generated"), new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, t("export.sheetIncidents").slice(0, 31));
  XLSX.utils.book_append_sheet(workbook, totals, t("export.sheetTotals").slice(0, 31));
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  triggerDownload(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `sitesafety-nordic-${stamp()}.xlsx`
  );
}

// ---------------------------------------------------------------------------
// PDF: generated in the browser with an embedded Unicode font (å ä ö ş ğ ı …)
// ---------------------------------------------------------------------------

type JsPdf = import("jspdf").jsPDF;

let fontCache: { regular: string; bold: string } | null = null;

async function loadFont(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font ${url} not found`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function createPdf(): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  if (!fontCache) {
    const [regular, bold] = await Promise.all([loadFont("/fonts/DejaVuSans.ttf"), loadFont("/fonts/DejaVuSans-Bold.ttf")]);
    fontCache = { regular, bold };
  }
  doc.addFileToVFS("DejaVuSans.ttf", fontCache.regular);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fontCache.bold);
  doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");
  doc.setFont("DejaVu", "normal");
  return doc;
}

function pdfHeader(doc: JsPdf, title: string, subtitle: string) {
  doc.setFont("DejaVu", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("SiteSafety Nordic", 40, 48);
  doc.setFontSize(13);
  doc.text(title, 40, 70);
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitle, 40, 86);
  doc.setDrawColor(226, 232, 240);
  doc.line(40, 96, 555, 96);
}

function pdfFooter(doc: JsPdf, locale: Locale) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(translate(locale, "statutory.aml"), 40, 815, { maxWidth: 440 });
    doc.text(`${page} / ${pages}`, 555, 815, { align: "right" });
  }
}

export interface PdfSummaryOptions {
  locale?: Locale;
  /** Shown under the title, e.g. the period of a report. */
  subtitle?: string;
  fileName?: string;
}

/** Summary PDF: metrics plus one table row per incident. Downloads directly, no popup. */
export async function downloadIncidentsPdf(incidents: Incident[], metrics: DashboardMetrics, options: PdfSummaryOptions = {}) {
  const locale = options.locale ?? "en";
  const t = (key: string) => translate(locale, key);
  const doc = await createPdf();
  const autoTable = (await import("jspdf-autotable")).default;
  const generated = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" });
  pdfHeader(doc, t("export.summaryTitle"), [options.subtitle, `${t("export.generated")}: ${generated}`].filter(Boolean).join(" · "));

  const tiles = [
    [t("dashboard.totalReports"), metrics.totalReports],
    [t("dashboard.openActions"), metrics.openActions],
    [t("dashboard.criticalNear"), metrics.criticalNearMisses],
    [t("dashboard.daysFree"), metrics.daysIncidentFree],
  ] as const;
  tiles.forEach(([label, value], index) => {
    const x = 40 + index * 130;
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, 110, 120, 52, 6, 6);
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x + 12, 138);
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x + 12, 153, { maxWidth: 100 });
  });

  const { header, rows } = incidentRows(incidents, locale);
  const keep = [0, 1, 2, 4, 5, 6, 7, 9, 10];
  autoTable(doc, {
    startY: 180,
    head: [keep.map((index) => header[index])],
    body: rows.map((row) => keep.map((index) => String(row[index]))),
    styles: { font: "DejaVu", fontSize: 7.5, cellPadding: 4, overflow: "linebreak", textColor: [15, 23, 42] },
    headStyles: { fillColor: [245, 158, 11], textColor: [15, 23, 42], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 64 }, 6: { cellWidth: 44 }, 7: { cellWidth: 50 } },
    margin: { left: 40, right: 40, bottom: 50 },
  });
  pdfFooter(doc, locale);
  doc.save(options.fileName ?? `sitesafety-nordic-${stamp()}.pdf`);
}

/** One incident on its own pages: facts, description, CAPA and the assistant analysis. */
export async function downloadIncidentPdf(incident: Incident, locale: Locale = "en") {
  const t = (key: string) => translate(locale, key);
  const doc = await createPdf();
  const autoTable = (await import("jspdf-autotable")).default;
  pdfHeader(doc, `${incident.reference} · ${typeLabel(incident.type, locale, incident.typeNote)}`, `${siteName(incident)} · ${formatDateTime(incident.createdAt, locale)}`);

  const facts: [string, string][] = [
    [t("export.type"), typeLabel(incident.type, locale, incident.typeNote)],
    [t("export.site"), siteName(incident)],
    [t("export.area"), locationName(incident)],
    [t("export.risk"), categoriesLabel(incidentCategories(incident), locale)],
    [t("export.severity"), severityLabel(incident.severity, locale)],
    [t("export.status"), statusLabel(incident.status, locale)],
    [t("export.reporter"), incident.anonymous ? t("report.anonymousPerson") : (incident.reporterName ?? "—")],
    [t("export.date"), formatDateTime(incident.createdAt, locale)],
  ];
  if (incident.latitude != null && incident.longitude != null) {
    facts.push([t("map.title"), `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}`]);
  }
  autoTable(doc, {
    startY: 110,
    body: facts,
    theme: "plain",
    styles: { font: "DejaVu", fontSize: 9.5, cellPadding: 4, textColor: [15, 23, 42] },
    columnStyles: { 0: { cellWidth: 120, fontStyle: "bold", textColor: [100, 116, 139] } },
    margin: { left: 40, right: 40 },
  });

  let y = (doc as JsPdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 300;
  const section = (title: string, lines: string[]) => {
    if (!lines.length) return;
    if (y > 700) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(10);
    doc.setTextColor(180, 83, 9);
    doc.text(title.toUpperCase(), 40, y + 22);
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const wrapped = doc.splitTextToSize(lines.join("\n"), 515) as string[];
    doc.text(wrapped, 40, y + 38);
    y += 38 + wrapped.length * 12;
  };

  section(t("export.description"), [incident.description]);
  if (incident.summarySv) section(t("ai.summaryTitle"), [incident.summarySv]);
  if (incident.originalText && incident.originalText !== incident.description) section(t("ai.originalTitle"), [incident.originalText]);
  if (incident.capa) {
    section(t("dashboard.capaTitle"), [
      `${t("export.owner")}: ${incident.capa.assigneeName || "—"}`,
      `${t("export.dueDate")}: ${incident.capa.dueDate || "—"}`,
      `${t("export.status")}: ${statusLabel(incident.capa.status, locale)}`,
      incident.capa.notes ? `${t("export.notes")}: ${incident.capa.notes}` : "",
    ].filter(Boolean));
  }
  if (incident.aiAnalysis) {
    const analysis = incident.aiAnalysis;
    section(t("analysis.title"), [
      analysis.summary,
      "",
      `${t("analysis.rootCauses")}:`,
      ...analysis.rootCauses.map((item) => `• ${item}`),
      "",
      `${t("analysis.immediate")}:`,
      ...analysis.immediateActions.map((item) => `• ${item}`),
      "",
      `${t("analysis.preventive")}:`,
      ...analysis.preventiveActions.map((item) => `• ${item}`),
      "",
      `${t("analysis.aml")}: ${analysis.amlReportRequired ? t("buttons.yes") : t("buttons.no")} — ${analysis.amlReason}`,
    ]);
  }
  pdfFooter(doc, locale);
  doc.save(`${incident.reference}.pdf`);
}

/** Kept for the print preview test; the dashboard downloads a real PDF now. */
export function buildIncidentsPdfHtml(incidents: Incident[], metrics: DashboardMetrics) {
  const rows = incidents
    .map(
      (incident) => `
        <tr>
          <td>${escapeHtml(incident.reference)}</td>
          <td>${escapeHtml(typeLabel(incident.type))}</td>
          <td>${escapeHtml(locationName(incident))}<br /><span class="muted">${escapeHtml(siteName(incident))}</span></td>
          <td>${escapeHtml(incident.severity)}</td>
          <td>${escapeHtml(statusLabel(incident.status))}</td>
          <td>${escapeHtml(incident.capa?.assigneeName ?? "—")}</td>
        </tr>`
    )
    .join("");

  const generatedAt = new Date().toLocaleString("en-GB", { timeZone: "Europe/Stockholm" });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SiteSafety Nordic — SAM summary</title>
    <style>
      body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; padding: 32px; }
      h1 { margin: 0 0 4px; font-size: 22px; }
      .sub { color: #475569; margin-bottom: 24px; }
      .metrics { display: flex; gap: 12px; margin-bottom: 24px; }
      .metric { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 16px; min-width: 120px; }
      .metric span { display: block; font-size: 12px; color: #64748b; }
      .metric strong { font-size: 22px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border-bottom: 1px solid #e2e8f0; text-align: left; padding: 8px 8px 8px 0; vertical-align: top; }
      th { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; }
      .muted { color: #64748b; font-size: 12px; }
      footer { margin-top: 28px; font-size: 12px; color: #64748b; }
    </style>
  </head>
  <body>
    <h1>SiteSafety Nordic</h1>
    <p class="sub">Incident and tillbud summary · SAM / Arbetsmiljöverket · ${escapeHtml(generatedAt)}</p>
    <div class="metrics">
      <div class="metric"><span>Total reports</span><strong>${metrics.totalReports}</strong></div>
      <div class="metric"><span>Open actions</span><strong>${metrics.openActions}</strong></div>
      <div class="metric"><span>Critical near-misses</span><strong>${metrics.criticalNearMisses}</strong></div>
      <div class="metric"><span>Days incident-free</span><strong>${metrics.daysIncidentFree}</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Ref</th><th>Type</th><th>Place</th><th>Severity</th><th>Status</th><th>CAPA owner</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <footer>Critical incidents resulting in severe injury or danger must be reported immediately to Arbetsmiljöverket.</footer>
  </body>
</html>`;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The assistant's management report as a PDF. */
export async function downloadAiReportPdf(report: AiReport, options: { locale?: Locale; scope?: string } = {}) {
  const locale = options.locale ?? "en";
  const t = (key: string) => translate(locale, key);
  const doc = await createPdf();
  const generated = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" });
  pdfHeader(doc, report.title || t("aiReport.title"), [options.scope, `${t("export.generated")}: ${generated}`].filter(Boolean).join(" · "));

  let y = 110;
  const ensure = (height: number) => {
    if (y + height > 790) {
      doc.addPage();
      y = 60;
    }
  };
  const heading = (text: string) => {
    ensure(40);
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(10);
    doc.setTextColor(180, 83, 9);
    doc.text(text.toUpperCase(), 40, y + 14);
    y += 22;
  };
  const paragraph = (text: string) => {
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(text, 515) as string[];
    for (const line of lines) {
      ensure(13);
      doc.text(line, 40, y + 10);
      y += 13;
    }
    y += 4;
  };
  const bullets = (items: string[]) => items.forEach((item) => paragraph(`• ${item}`));

  paragraph(report.summary);
  if (report.keyFigures.length) {
    heading(t("aiReport.keyFigures"));
    bullets(report.keyFigures.map((item) => `${item.label}: ${item.value}`));
  }
  if (report.trends.length) {
    heading(t("aiReport.trends"));
    bullets(report.trends);
  }
  if (report.topRisks.length) {
    heading(t("aiReport.topRisks"));
    bullets(report.topRisks.map((item) => `${item.risk} (${item.count}) — ${item.comment}`));
  }
  if (report.hotspots.length) {
    heading(t("aiReport.hotspots"));
    bullets(report.hotspots);
  }
  if (report.recommendations.length) {
    heading(t("aiReport.recommendations"));
    report.recommendations.forEach((item, index) => paragraph(`${index + 1}. ${item}`));
  }
  if (report.positives.length) {
    heading(t("aiReport.positives"));
    bullets(report.positives);
  }
  ensure(30);
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(t("aiReport.disclaimer"), 40, y + 14, { maxWidth: 515 });
  pdfFooter(doc, locale);
  doc.save(`sitesafety-ai-report-${stamp()}.pdf`);
}
