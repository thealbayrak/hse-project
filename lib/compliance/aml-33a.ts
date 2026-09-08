import { categoryLabel, typeLabel } from "@/lib/format";
import type { Incident, Site } from "@/lib/types";

export interface AmlNoticeModel {
  reference: string;
  organizationName: string;
  organizationNumber: string;
  siteName: string;
  address: string;
  city: string;
  eventDate: string;
  eventTime: string;
  specificLocation: string;
  incidentType: string;
  category: string;
  severity: string;
  sequenceOfEvents: string;
  immediateContainment: string;
  rootCause: string;
  capaAssignee: string;
  capaDueDate: string;
  capaStatus: string;
  capaNotes: string;
}

function stockholmParts(iso: string) {
  const date = new Date(iso);
  const dateFmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    eventDate: Number.isNaN(date.getTime()) ? "—" : dateFmt.format(date),
    eventTime: Number.isNaN(date.getTime()) ? "—" : timeFmt.format(date),
  };
}

export function buildAmlNoticeModel(incident: Incident, site: Site | null): AmlNoticeModel {
  const { eventDate, eventTime } = stockholmParts(incident.createdAt);
  const capa = incident.capa;

  return {
    reference: incident.reference,
    organizationName: site?.organizationName || site?.name || incident.siteName || "—",
    organizationNumber: site?.organizationNumber || "—",
    siteName: site?.name || incident.siteName || incident.siteId,
    address: site?.address || [site?.city, incident.siteName].filter(Boolean).join(", ") || "—",
    city: site?.city || "—",
    eventDate,
    eventTime,
    specificLocation: incident.locationName || incident.locationId || "—",
    incidentType: typeLabel(incident.type),
    category: categoryLabel(incident.category),
    severity: incident.severity.toUpperCase(),
    sequenceOfEvents: incident.description,
    immediateContainment: capa?.notes?.trim()
      ? capa.notes
      : "Ej ännu dokumenterat. Immediate containment must be recorded in CAPA before filing with Arbetsmiljöverket.",
    rootCause: `${categoryLabel(incident.category)} — ${typeLabel(incident.type)}`,
    capaAssignee: capa?.assigneeName || "Ej tilldelad / Not assigned",
    capaDueDate: capa?.dueDate || "—",
    capaStatus: capa?.status ? capa.status.replace("-", " ") : "open",
    capaNotes: capa?.notes?.trim() || "No CAPA notes recorded yet.",
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br />");
}

function field(labelSv: string, labelEn: string, value: string) {
  return `<tr>
    <td style="width:34%;padding:8px 10px;border:1px solid #1e293b;background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#475569;">${labelSv}<br /><span style="font-weight:400;text-transform:none;letter-spacing:0;color:#64748b;">${labelEn}</span></td>
    <td style="padding:8px 10px;border:1px solid #1e293b;font-size:13px;color:#0f172a;">${escapeHtml(value)}</td>
  </tr>`;
}

export function buildAmlNoticeHtml(model: AmlNoticeModel) {
  return `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <title>AML 3:3a ${escapeHtml(model.reference)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #e2e8f0;
        color: #0f172a;
        font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      }
      .toolbar {
        position: sticky;
        top: 0;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding: 12px 16px;
        background: #0f172a;
      }
      .toolbar button {
        min-height: 44px;
        padding: 0 16px;
        border: 0;
        border-radius: 8px;
        font-weight: 700;
        cursor: pointer;
      }
      .print { background: #f59e0b; color: #0f172a; }
      .sheet {
        width: min(210mm, 100% - 24px);
        margin: 16px auto 32px;
        background: #fff;
        color: #0f172a;
        border: 1px solid #0f172a;
        padding: 22px 22px 28px;
      }
      h1 { font-size: 18px; margin: 0 0 6px; line-height: 1.3; }
      .sub { font-size: 12px; color: #475569; margin: 0 0 16px; }
      .banner {
        border: 2px solid #991b1b;
        background: #fef2f2;
        color: #7f1d1d;
        padding: 10px 12px;
        font-size: 12px;
        margin-bottom: 16px;
      }
      .section {
        margin-top: 16px;
        border: 1px solid #0f172a;
      }
      .section h2 {
        margin: 0;
        padding: 8px 10px;
        background: #0f172a;
        color: #fff;
        font-size: 13px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      table { width: 100%; border-collapse: collapse; }
      .block { padding: 10px; font-size: 13px; line-height: 1.5; min-height: 72px; }
      .foot { margin-top: 16px; font-size: 11px; color: #475569; }
      @media print {
        body { background: #fff; }
        .toolbar { display: none !important; }
        .sheet { margin: 0; width: auto; border-color: #000; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button class="print" type="button" onclick="window.print()">Print / Save PDF</button>
    </div>
    <article class="sheet">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.16em;font-weight:700;color:#991b1b;">ARBETSMILJÖVERKET · FORMULÄR FÖR ANMÄLAN</p>
      <h1>Anmälan om allvarligt tillbud eller arbetsskada (Arbetsmiljölagen 3 kap. 3 a §)</h1>
      <p class="sub">Supporting notice generated by SiteSafety Nordic · Ref. ${escapeHtml(model.reference)}</p>
      <div class="banner">
        Allvarliga tillbud och olycksfall ska anmälas till Arbetsmiljöverket utan dröjsmål.
        Severe accidents and dangerous near-misses (tillbud) must be notified to Arbetsmiljöverket without delay.
      </div>

      <section class="section">
        <h2>A. Arbetsställe &amp; verksamhet</h2>
        <table>
          ${field("Arbetsställe", "Site name", model.siteName)}
          ${field("Verksamhet / bolag", "Organization", model.organizationName)}
          ${field("Organisationsnummer", "Organization number", model.organizationNumber)}
          ${field("Adress", "Address", model.address)}
          ${field("Ort", "City", model.city)}
        </table>
      </section>

      <section class="section">
        <h2>B. Händelseförlopp</h2>
        <table>
          ${field("Datum", "Date", model.eventDate)}
          ${field("Klockslag", "Time (Europe/Stockholm)", model.eventTime)}
          ${field("Plats på arbetsstället", "Specific location", model.specificLocation)}
          ${field("Typ av händelse", "Incident type", model.incidentType)}
          ${field("Riskkategori", "Category", model.category)}
          ${field("Allvarlighetsgrad", "Severity", model.severity)}
        </table>
        <div class="block"><strong>Detaljerad redogörelse / Sequence of events</strong><br /><br />${escapeHtml(model.sequenceOfEvents)}</div>
      </section>

      <section class="section">
        <h2>C. Riskbedömning &amp; vidtagna åtgärder</h2>
        <table>
          ${field("Omedelbara åtgärder", "Immediate containment", model.immediateContainment)}
          ${field("Bedömd orsak", "Root cause / risk", model.rootCause)}
          ${field("CAPA-ansvarig", "Assigned owner", model.capaAssignee)}
          ${field("Förfallodatum", "Due date", model.capaDueDate)}
          ${field("Status", "CAPA status", model.capaStatus)}
        </table>
        <div class="block"><strong>CAPA-åtgärder / Assigned actions</strong><br /><br />${escapeHtml(model.capaNotes)}</div>
      </section>

      <p class="foot">
        Detta underlag stöder anmälan enligt AML 3 kap. 3 a §. Den officiella anmälan görs hos Arbetsmiljöverket.
        This document supports statutory notification; it does not replace filing in Arbetsmiljöverket’s e-service.
      </p>
    </article>
  </body>
</html>`;
}

export function openAmlNotice(model: AmlNoticeModel, options?: { autoPrint?: boolean }) {
  const html = buildAmlNoticeHtml(model);
  const popup = window.open("", "_blank", "noopener,noreferrer,width=920,height=1100");
  if (popup) {
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    if (options?.autoPrint) {
      window.setTimeout(() => {
        try {
          popup.print();
        } catch {
          // Print UI is still available in the notice tab.
        }
      }, 250);
    }
    return true;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return false;
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    frame.remove();
  }, 250);
  return true;
}
