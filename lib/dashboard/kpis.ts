import { isPositiveType, type Incident, type Severity } from "@/lib/types";

const DAY_MS = 86_400_000;

/**
 * Mean days from report to resolution, over resolved reports whose last action
 * update is known. Null when nothing has been resolved yet.
 */
export function averageResolutionDays(incidents: Incident[]): number | null {
  const days: number[] = [];
  for (const incident of incidents) {
    if (incident.status !== "resolved" || !incident.capa?.updatedAt) continue;
    const spent = (new Date(incident.capa.updatedAt).getTime() - new Date(incident.createdAt).getTime()) / DAY_MS;
    if (Number.isFinite(spent) && spent >= 0) days.push(spent);
  }
  if (!days.length) return null;
  return Math.round((days.reduce((sum, value) => sum + value, 0) / days.length) * 10) / 10;
}

export interface SubcontractorCount {
  /** The name as reported; "" groups reports without one. */
  key: string;
  count: number;
  /** True for the folded remainder after the top entries. */
  other?: boolean;
}

/** Reports per subcontractor, largest first; the tail is folded into one "other" bar. */
export function incidentsBySubcontractor(incidents: Incident[], max = 6): SubcontractorCount[] {
  const counts = new Map<string, number>();
  for (const incident of incidents) {
    const key = (incident.subcontractor ?? "").trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((sum, item) => sum + item.count, 0);
  return [...head, { key: "", count: rest, other: true }];
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "unrated"];

export interface SeveritySlice {
  severity: Severity;
  count: number;
  share: number;
}

/** Share of reports per severity level (pending review included), zero levels left out. */
export function severityDistribution(incidents: Incident[]): SeveritySlice[] {
  const total = incidents.length;
  if (!total) return [];
  return SEVERITY_ORDER.map((severity) => {
    const count = incidents.filter((incident) => incident.severity === severity).length;
    return { severity, count, share: count / total };
  }).filter((slice) => slice.count > 0);
}

/** Reports that still wait for a manager to rate them (praise needs no rating). */
export function isPendingReview(incident: Pick<Incident, "severity" | "type" | "status">) {
  return incident.severity === "unrated" && !isPositiveType(incident.type) && incident.status !== "resolved";
}
