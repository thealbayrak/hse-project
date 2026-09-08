import type { DashboardMetrics, Incident } from "@/lib/types";

export function sortIncidents(incidents: Incident[]) {
  return [...incidents].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function computeMetrics(incidents: Incident[]): DashboardMetrics {
  const openActions = incidents.filter((incident) => incident.status !== "resolved").length;
  const criticalNearMisses = incidents.filter(
    (incident) =>
      incident.type === "near-miss" &&
      incident.severity === "critical" &&
      incident.status !== "resolved"
  ).length;

  const accidents = incidents
    .filter((incident) => incident.type === "accident")
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const lastAccident = accidents[0];
  const daysIncidentFree = lastAccident
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(lastAccident.createdAt).getTime()) / 86_400_000)
      )
    : 90;

  return {
    totalReports: incidents.length,
    openActions,
    criticalNearMisses,
    daysIncidentFree,
  };
}
