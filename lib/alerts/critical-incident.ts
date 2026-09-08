import type { Incident, IncidentType, RiskCategory, Severity } from "@/lib/types";

export interface CriticalIncidentAlertPayload {
  incidentId: string;
  type: IncidentType;
  category: RiskCategory;
  severity: Severity;
  title: string;
  description: string;
  siteName: string;
  specificLocation: string;
  occurredAt: string;
  requiresArbetsmiljoverketReport: boolean;
}

export function shouldDispatchCriticalAlert(incident: Pick<Incident, "severity">) {
  return incident.severity === "critical";
}

export function toCriticalIncidentAlertPayload(incident: Incident): CriticalIncidentAlertPayload {
  return {
    incidentId: incident.id,
    type: incident.type,
    category: incident.category,
    severity: incident.severity,
    title: incident.reference,
    description: incident.description,
    siteName: incident.siteName ?? incident.siteId,
    specificLocation: incident.locationName ?? incident.locationId,
    occurredAt: incident.createdAt,
    requiresArbetsmiljoverketReport: incident.severity === "critical" || incident.type === "accident",
  };
}

/** Fire-and-forget. Never throws — report submission must not depend on email delivery. */
export function dispatchCriticalIncidentAlert(incident: Incident) {
  if (!shouldDispatchCriticalAlert(incident)) return;

  const payload = toCriticalIncidentAlertPayload(incident);

  void fetch("/api/alerts/critical-incident", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}
