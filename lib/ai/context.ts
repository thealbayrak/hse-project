import { categoriesLabel, placeLabel, typeLabel } from "@/lib/format";
import { incidentCategories, type Incident } from "@/lib/types";

/** One incident as the assistant sees it: short, no personal data beyond what officers already see. */
export interface CompactIncident {
  ref: string;
  date: string;
  type: string;
  severity: string;
  status: string;
  place: string;
  risks: string;
  text: string;
  owner: string | null;
  due: string | null;
  overdue: boolean;
  source: string;
  anonymous: boolean;
}

export interface IncidentStats {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  byRisk: Record<string, number>;
  byPlace: Record<string, number>;
  overdue: number;
  unclassified: number;
  anonymous: number;
}

const MAX_INCIDENTS = 300;
const MAX_TEXT = 240;

function stockholmDay(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(iso));
}

export function compactIncidents(incidents: Incident[], today = stockholmDay(new Date().toISOString())): CompactIncident[] {
  return [...incidents]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, MAX_INCIDENTS)
    .map((incident) => {
      const text = (incident.summarySv || incident.description || "").replaceAll(/\s+/g, " ").trim();
      const due = incident.capa?.dueDate || null;
      return {
        ref: incident.reference,
        date: stockholmDay(incident.createdAt),
        type: typeLabel(incident.type, "en", incident.typeNote),
        severity: incident.severity,
        status: incident.status,
        place: placeLabel(incident),
        risks: categoriesLabel(incidentCategories(incident), "en"),
        text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text,
        owner: incident.capa?.assigneeName || null,
        due,
        overdue: Boolean(due) && incident.status !== "resolved" && due! < today,
        source: incident.source ?? "report",
        anonymous: incident.anonymous,
      };
    });
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

/** Exact counts, so the model reports numbers instead of estimating them. */
export function incidentStats(rows: CompactIncident[]): IncidentStats {
  const stats: IncidentStats = {
    total: rows.length,
    byType: {},
    bySeverity: {},
    byStatus: {},
    byRisk: {},
    byPlace: {},
    overdue: 0,
    unclassified: 0,
    anonymous: 0,
  };
  for (const row of rows) {
    bump(stats.byType, row.type);
    bump(stats.bySeverity, row.severity);
    bump(stats.byStatus, row.status);
    bump(stats.byPlace, row.place);
    if (row.risks === "Not classified yet") stats.unclassified += 1;
    else for (const risk of row.risks.split(", ")) bump(stats.byRisk, risk);
    if (row.overdue) stats.overdue += 1;
    if (row.anonymous) stats.anonymous += 1;
  }
  return stats;
}
