import type { Incident, IncidentType, RiskCategory, Severity } from "@/lib/types";

export type PeriodPreset = "today" | "week" | "month" | "year" | "custom";

export interface Period {
  /** Inclusive start, ISO date (YYYY-MM-DD) in Europe/Stockholm. */
  from: string;
  /** Inclusive end, ISO date. */
  to: string;
}

const DAY_MS = 86_400_000;

function stockholmDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(date);
}

/** Stockholm calendar bounds for a preset. */
export function periodFor(preset: Exclude<PeriodPreset, "custom">, now = new Date()): Period {
  const today = stockholmDate(now);
  const [year, month, day] = today.split("-").map(Number);
  const local = new Date(Date.UTC(year, month - 1, day));
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const weekday = (local.getUTCDay() + 6) % 7; // Monday = 0
    const monday = new Date(local.getTime() - weekday * DAY_MS);
    return { from: monday.toISOString().slice(0, 10), to: today };
  }
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export function inPeriod(iso: string, period: Period) {
  const day = stockholmDate(new Date(iso));
  return day >= period.from && day <= period.to;
}

export interface ReporterStat {
  reporterId: string;
  name: string;
  count: number;
  critical: number;
  badge: "gold" | "silver" | "bronze" | null;
}

export interface ReportSummary {
  period: Period;
  total: number;
  byType: Record<IncidentType, number>;
  bySeverity: Record<Severity, number>;
  byCategory: { category: RiskCategory; count: number }[];
  bySite: { siteId: string; siteName: string; count: number; critical: number; resolved: number }[];
  resolved: number;
  resolutionRate: number;
  /** Median hours from report to resolution, for resolved incidents with a CAPA update. */
  medianCloseHours: number | null;
  overdueActions: number;
  anonymous: number;
  reporters: ReporterStat[];
  trend: { day: string; count: number; critical: number }[];
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function badgeFor(count: number): ReporterStat["badge"] {
  if (count >= 5) return "gold";
  if (count >= 3) return "silver";
  if (count >= 1) return "bronze";
  return null;
}

/** Everything the Reports screen shows, computed from the incidents in a period. */
export function summarize(all: Incident[], period: Period, today = stockholmDate(new Date())): ReportSummary {
  const incidents = all.filter((incident) => inPeriod(incident.createdAt, period));
  const byType: Record<IncidentType, number> = {
    "near-miss": 0,
    hazard: 0,
    accident: 0,
    "good-observation": 0,
    "positive-observation": 0,
    environmental: 0,
    other: 0,
  };
  const bySeverity: Record<Severity, number> = { unrated: 0, low: 0, medium: 0, high: 0, critical: 0 };
  const categoryCounts = new Map<RiskCategory, number>();
  const siteStats = new Map<string, { siteId: string; siteName: string; count: number; critical: number; resolved: number }>();
  const reporterStats = new Map<string, ReporterStat>();
  const trendMap = new Map<string, { count: number; critical: number }>();
  const closeHours: number[] = [];
  let resolved = 0;
  let overdue = 0;
  let anonymous = 0;

  for (const incident of incidents) {
    byType[incident.type] += 1;
    bySeverity[incident.severity] += 1;
    categoryCounts.set(incident.category, (categoryCounts.get(incident.category) ?? 0) + 1);

    const site = siteStats.get(incident.siteId) ?? { siteId: incident.siteId, siteName: incident.siteName ?? incident.siteId, count: 0, critical: 0, resolved: 0 };
    site.count += 1;
    if (incident.severity === "critical") site.critical += 1;
    if (incident.status === "resolved") site.resolved += 1;
    siteStats.set(incident.siteId, site);

    if (incident.status === "resolved") {
      resolved += 1;
      if (incident.capa?.updatedAt) {
        const hours = (new Date(incident.capa.updatedAt).getTime() - new Date(incident.createdAt).getTime()) / 3_600_000;
        if (hours >= 0) closeHours.push(hours);
      }
    } else if (incident.capa?.dueDate && incident.capa.dueDate < today) {
      overdue += 1;
    }

    if (incident.anonymous || !(incident.reporterProfileId || incident.reporterName)) {
      anonymous += 1;
    } else {
      const key = incident.reporterProfileId ?? `name:${incident.reporterName}`;
      const stat = reporterStats.get(key) ?? { reporterId: key, name: incident.reporterName ?? "—", count: 0, critical: 0, badge: null };
      stat.count += 1;
      if (incident.severity === "critical") stat.critical += 1;
      reporterStats.set(key, stat);
    }

    const day = stockholmDate(new Date(incident.createdAt));
    const point = trendMap.get(day) ?? { count: 0, critical: 0 };
    point.count += 1;
    if (incident.severity === "critical") point.critical += 1;
    trendMap.set(day, point);
  }

  const reporters = [...reporterStats.values()]
    .map((stat) => ({ ...stat, badge: badgeFor(stat.count) }))
    .sort((a, b) => b.count - a.count || b.critical - a.critical || a.name.localeCompare(b.name));

  return {
    period,
    total: incidents.length,
    byType,
    bySeverity,
    byCategory: [...categoryCounts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    bySite: [...siteStats.values()].sort((a, b) => b.count - a.count),
    resolved,
    resolutionRate: incidents.length ? resolved / incidents.length : 0,
    medianCloseHours: median(closeHours),
    overdueActions: overdue,
    anonymous,
    reporters,
    trend: [...trendMap.entries()].map(([day, point]) => ({ day, ...point })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** Fills the trend with zero days so bars are evenly spaced; buckets by week when the period is long. */
export function trendBuckets(summary: ReportSummary): { label: string; count: number; critical: number }[] {
  const start = new Date(`${summary.period.from}T00:00:00Z`);
  const end = new Date(`${summary.period.to}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  const byDay = new Map(summary.trend.map((point) => [point.day, point]));

  if (days <= 31) {
    const out = [];
    for (let i = 0; i < days; i += 1) {
      const day = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
      const point = byDay.get(day);
      out.push({ label: day.slice(5), count: point?.count ?? 0, critical: point?.critical ?? 0 });
    }
    return out;
  }

  const weeks = Math.ceil(days / 7);
  const out = [];
  for (let w = 0; w < weeks; w += 1) {
    const from = new Date(start.getTime() + w * 7 * DAY_MS);
    let count = 0;
    let critical = 0;
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(from.getTime() + d * DAY_MS).toISOString().slice(0, 10);
      const point = byDay.get(day);
      count += point?.count ?? 0;
      critical += point?.critical ?? 0;
    }
    out.push({ label: from.toISOString().slice(5, 10), count, critical });
  }
  return out;
}
