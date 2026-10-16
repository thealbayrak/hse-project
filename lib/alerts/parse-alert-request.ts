import type { CriticalIncidentAlertPayload } from "@/lib/alerts/critical-incident";
import type { IncidentType, RiskCategory, Severity } from "@/lib/types";

const INCIDENT_TYPES: IncidentType[] = ["near-miss", "hazard", "accident"];
const CATEGORIES: RiskCategory[] = [
  "falls",
  "machine",
  "falling-objects",
  "slip-trip",
  "chemical",
  "electrical",
  "ergonomic",
];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isIncidentType(value: unknown): value is IncidentType {
  return typeof value === "string" && INCIDENT_TYPES.includes(value as IncidentType);
}

export function isCategory(value: unknown): value is RiskCategory {
  return typeof value === "string" && CATEGORIES.includes(value as RiskCategory);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && SEVERITIES.includes(value as Severity);
}

export type AlertRequest =
  | { kind: "webhook"; incidentId: string }
  | { kind: "client"; incidentId: string; payload: CriticalIncidentAlertPayload | null };

/**
 * Accepts either a Supabase Database Webhook body
 * (`{ type: "INSERT", table: "incidents", record: { id } }`) or the app's own
 * client payload. Returns null when neither shape is recognisable.
 */
export function parseAlertRequest(body: unknown): AlertRequest | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;

  if (value.type === "INSERT" || value.type === "UPDATE") {
    const record = value.record as Record<string, unknown> | undefined;
    const id = record?.id;
    if (typeof id !== "string" || !UUID.test(id)) return null;
    return { kind: "webhook", incidentId: id };
  }

  if (typeof value.incidentId !== "string" || !value.incidentId) return null;
  return { kind: "client", incidentId: value.incidentId, payload: parseClientPayload(value) };
}

export function parseClientPayload(value: Record<string, unknown>): CriticalIncidentAlertPayload | null {
  if (typeof value.incidentId !== "string" || !value.incidentId) return null;
  if (!isIncidentType(value.type)) return null;
  if (!isCategory(value.category)) return null;
  if (!isSeverity(value.severity)) return null;
  if (typeof value.title !== "string") return null;
  if (typeof value.description !== "string") return null;
  if (typeof value.siteName !== "string") return null;
  if (typeof value.specificLocation !== "string") return null;
  if (typeof value.occurredAt !== "string") return null;

  return {
    incidentId: value.incidentId,
    type: value.type,
    category: value.category,
    severity: value.severity,
    title: value.title,
    description: value.description,
    siteName: value.siteName,
    specificLocation: value.specificLocation,
    occurredAt: value.occurredAt,
    requiresArbetsmiljoverketReport: Boolean(value.requiresArbetsmiljoverketReport),
  };
}
