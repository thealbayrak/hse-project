import type { Incident, Severity } from "@/lib/types";

export interface ReporterStat {
  /** Profile id, or the typed name in lower case; "anonymous" groups everyone who did not give a name. */
  key: string;
  /** Null for the anonymous row. */
  name: string | null;
  count: number;
  severity: Record<Severity, number>;
  /** ISO time of the newest report. */
  lastAt: string;
}

const EMPTY: Record<Severity, number> = { unrated: 0, low: 0, medium: 0, high: 0, critical: 0 };

/**
 * Who reported how much, and how serious it was. People who gave their name (or
 * picked themselves from the list) get a row each, most reports first;
 * everyone who stayed anonymous is counted together in the last row.
 */
export function reporterStats(incidents: Incident[]): ReporterStat[] {
  const rows = new Map<string, ReporterStat>();
  for (const incident of incidents) {
    const name = incident.anonymous ? null : (incident.reporterName ?? "").trim() || null;
    const key = name ? (incident.reporterProfileId ?? `name:${name.toLowerCase()}`) : "anonymous";
    const row = rows.get(key) ?? { key, name, count: 0, severity: { ...EMPTY }, lastAt: incident.createdAt };
    row.count += 1;
    row.severity[incident.severity] += 1;
    if (incident.createdAt > row.lastAt) row.lastAt = incident.createdAt;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => {
    if (a.key === "anonymous") return 1;
    if (b.key === "anonymous") return -1;
    return b.count - a.count || (a.name ?? "").localeCompare(b.name ?? "");
  });
}
