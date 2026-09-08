import type {
  ActionRow,
  AttachmentRow,
  IncidentRow,
  LocationRow,
  SafetyWalkItemRow,
  SafetyWalkRow,
  SiteRow,
} from "@/lib/supabase/database.types";
import type {
  CapaAction,
  Incident,
  IncidentStatus,
  IncidentType,
  RiskCategory,
  SafetyWalk,
  SafetyWalkDomainId,
  SafetyWalkItem,
  SafetyWalkItemStatus,
  SafetyWalkSummary,
  Severity,
  Site,
} from "@/lib/types";

type Nested<T> = T | T[] | null | undefined;

export interface IncidentQueryRow extends IncidentRow {
  sites?: Nested<Pick<SiteRow, "id" | "name" | "city">>;
  site_locations?: Nested<Pick<LocationRow, "id" | "name">>;
  locations?: Nested<Pick<LocationRow, "id" | "name">>;
  actions?: Nested<ActionRow>;
  incident_attachments?: Nested<AttachmentRow>;
}

export interface SiteQueryRow {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  organization_id?: string | null;
  organization_number?: string | null;
  organizations?: Nested<{
    id?: string;
    name: string;
    organization_number?: string | null;
    org_number?: string | null;
    address?: string | null;
  }>;
  site_locations?: Nested<Pick<LocationRow, "id" | "name">>;
  locations?: Nested<Pick<LocationRow, "id" | "name">>;
}

function unwrapOne<T>(value: Nested<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function unwrapMany<T>(value: Nested<T>): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function mapIncidentType(value: string): IncidentType {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "near-miss" || normalized === "tillbud") return "near-miss";
  if (normalized === "hazard" || normalized === "risk" || normalized === "hazard-observation") {
    return "hazard";
  }
  return "accident";
}

export function mapSeverity(value: string): Severity {
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "medium";
}

export function mapStatus(value: string): IncidentStatus {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "in-progress") return "in-progress";
  if (normalized === "resolved") return "resolved";
  return "open";
}

export function mapCategory(value: string): RiskCategory {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  const allowed: RiskCategory[] = [
    "falls",
    "machine",
    "falling-objects",
    "slip-trip",
    "chemical",
    "electrical",
    "ergonomic",
  ];
  return allowed.includes(normalized as RiskCategory) ? (normalized as RiskCategory) : "machine";
}

export function mapCapa(row: ActionRow | null): CapaAction | null {
  if (!row) return null;
  return {
    id: row.id,
    assigneeId: row.assignee_id ?? "",
    assigneeName: row.assignee_name ?? "",
    dueDate: row.due_date ?? "",
    status: mapStatus(row.status),
    notes: row.notes ?? "",
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

export function mapIncident(row: IncidentQueryRow): Incident {
  const site = unwrapOne(row.sites);
  const location = unwrapOne(row.site_locations) ?? unwrapOne(row.locations);
  const actions = unwrapMany(row.actions).sort((a, b) => {
    return +new Date(b.updated_at ?? b.created_at ?? 0) - +new Date(a.updated_at ?? a.created_at ?? 0);
  });
  const attachments = unwrapMany(row.incident_attachments);

  return {
    id: row.id,
    reference: row.reference || `SS-${row.id.slice(0, 8).toUpperCase()}`,
    type: mapIncidentType(row.type),
    siteId: row.site_id,
    locationId: row.location_id ?? location?.id ?? "",
    siteName: site?.name,
    locationName: location?.name ?? row.location ?? undefined,
    category: mapCategory(row.category),
    severity: mapSeverity(row.severity),
    description: row.description,
    mediaUrls: attachments
      .filter((item) => item.kind !== "voice")
      .map((item) => item.url)
      .filter((url): url is string => Boolean(url)),
    anonymous: Boolean(row.is_anonymous ?? row.anonymous),
    reporterName: row.reporter_name,
    status: mapStatus(row.status),
    createdAt: row.created_at,
    capa: mapCapa(actions[0] ?? null),
    source: row.source === "skyddsrond" || (row.reference ?? "").startsWith("SR-") ? "skyddsrond" : "report",
  };
}

export function mapSite(row: SiteQueryRow): Site {
  const org = unwrapOne(row.organizations);
  const locations = [
    ...unwrapMany(row.site_locations),
    ...unwrapMany(row.locations),
  ];
  const unique = new Map(locations.map((item) => [item.id, item]));
  const mapped = [...unique.values()].map((item) => ({ id: item.id, name: item.name }));

  return {
    id: row.id,
    name: row.name,
    city: row.city || "",
    address: row.address || org?.address || undefined,
    organizationId: row.organization_id || org?.id || undefined,
    organizationNumber: row.organization_number || org?.organization_number || org?.org_number || undefined,
    organizationName: org?.name,
    locations: mapped.length ? mapped : [{ id: row.id, name: row.name }],
  };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isSkyddsrondIncident(incident: Pick<Incident, "source" | "reference">) {
  return incident.source === "skyddsrond" || incident.reference.startsWith("SR-");
}

export function mapWalkItemStatus(value: string): SafetyWalkItemStatus {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "deviation" || normalized === "avvikelse") return "deviation";
  if (normalized === "na" || normalized === "n/a" || normalized === "ej-relevant" || normalized === "not-applicable") {
    return "na";
  }
  return "ok";
}

export function mapWalkDomain(value: string): SafetyWalkDomainId {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  const allowed: SafetyWalkDomainId[] = [
    "fall-protection",
    "order-cleanliness",
    "scaffolding-ladders",
    "ppe",
    "emergency-fire",
  ];
  return allowed.includes(normalized as SafetyWalkDomainId)
    ? (normalized as SafetyWalkDomainId)
    : "order-cleanliness";
}

export function mapWalkItem(
  row: SafetyWalkItemRow,
  actionStatus: SafetyWalkItem["actionStatus"] = null
): SafetyWalkItem {
  return {
    id: row.id,
    walkId: row.safety_walk_id,
    itemKey: row.item_key,
    domain: mapWalkDomain(row.domain),
    title: row.title,
    status: mapWalkItemStatus(row.status),
    notes: row.notes ?? "",
    photoUrl: row.photo_url,
    sortOrder: row.sort_order ?? 0,
    actionStatus,
  };
}

export interface SafetyWalkQueryRow extends SafetyWalkRow {
  sites?: Nested<Pick<SiteRow, "id" | "name">>;
  safety_walk_items?: Nested<SafetyWalkItemRow>;
}

export function mapSafetyWalk(
  row: SafetyWalkQueryRow,
  actionByItemId: Map<string, ActionRow> = new Map()
): SafetyWalk {
  const site = unwrapOne(row.sites);
  const items = unwrapMany(row.safety_walk_items)
    .map((item) => {
      const action = actionByItemId.get(item.id);
      const raw = action?.status?.toLowerCase() ?? "";
      const actionStatus: SafetyWalkItem["actionStatus"] = !action
        ? null
        : raw === "pending"
          ? "pending"
          : mapStatus(action.status);
      return mapWalkItem(item, actionStatus);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: row.id,
    title: row.title,
    siteId: row.site_id,
    siteName: site?.name,
    skyddsombudName:
      row.skyddsombud_name || row.attending_skyddsombud || row.skyddsombud || "—",
    skyddsombudRole: row.skyddsombud_role || "",
    completedAt: row.completed_at,
    items,
  };
}

export function toSafetyWalkSummary(walk: SafetyWalk): SafetyWalkSummary {
  const deviations = walk.items.filter((item) => item.status === "deviation");
  const resolvedDeviations = deviations.filter((item) => item.actionStatus === "resolved").length;
  return {
    id: walk.id,
    title: walk.title,
    siteId: walk.siteId,
    siteName: walk.siteName,
    skyddsombudName: walk.skyddsombudName,
    skyddsombudRole: walk.skyddsombudRole,
    completedAt: walk.completedAt,
    deviationCount: deviations.length,
    resolvedDeviations,
    activeDeviations: deviations.length - resolvedDeviations,
  };
}
