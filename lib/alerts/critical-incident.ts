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

export function requiresArbetsmiljoverketReport(incident: Pick<Incident, "severity" | "type">) {
  return incident.severity === "critical" || incident.type === "accident";
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
    requiresArbetsmiljoverketReport: requiresArbetsmiljoverketReport(incident),
  };
}

/**
 * Fire-and-forget. Never throws — report submission must not depend on email delivery.
 * Every report is sent: the server routes it by role (foreman → officers → HSE
 * manager) and raises the statutory critical alert when needed. With Supabase
 * the server only trusts `incidentId` and re-reads the incident itself; the
 * remaining fields are used in demo (mock) mode only.
 */
export function dispatchCriticalIncidentAlert(incident: Incident, language?: string) {
  if (incident.pending) return;

  const payload = { ...toCriticalIncidentAlertPayload(incident), language };

  void fetch("/api/alerts/critical-incident", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}
