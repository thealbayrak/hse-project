import {
  categoryLabel,
  csvEscape,
  formatDateTime,
  locationLabel,
  siteLabel,
  statusLabel,
  typeLabel,
} from "@/lib/format";
import type { DashboardMetrics, Incident } from "@/lib/types";

function siteName(incident: Incident) {
  return incident.siteName || siteLabel(incident.siteId);
}

function locationName(incident: Incident) {
  return incident.locationName || locationLabel(incident.siteId, incident.locationId);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function downloadIncidentsCsv(incidents: Incident[]) {
  const header = [
    "Reference",
    "Type",
    "Site",
    "Location",
    "Category",
    "Severity",
    "Status",
    "Anonymous",
    "Reporter",
    "Created (Europe/Stockholm)",
    "Assignee",
    "Due date",
    "CAPA notes",
    "Description",
  ];

  const rows = incidents.map((incident) =>
    [
      incident.reference,
      typeLabel(incident.type),
      siteName(incident),
      locationName(incident),
      categoryLabel(incident.category),
      incident.severity,
      statusLabel(incident.status),
      incident.anonymous ? "Yes" : "No",
      incident.anonymous ? "Anonymous" : (incident.reporterName ?? ""),
      formatDateTime(incident.createdAt),
      incident.capa?.assigneeName ?? "",
      incident.capa?.dueDate ?? "",
      incident.capa?.notes ?? "",
      incident.description,
    ]
      .map((value) => csvEscape(String(value)))
      .join(",")
  );

  // BOM so Excel opens Swedish characters correctly.
  const blob = new Blob(["﻿", [header.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, `sitesafety-nordic-summary-${stamp()}.csv`);
}

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

export function printIncidentsPdf(incidents: Incident[], metrics: DashboardMetrics) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!popup) return false;

  popup.document.write(buildIncidentsPdfHtml(incidents, metrics));
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
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
