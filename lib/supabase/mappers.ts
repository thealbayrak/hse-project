import type {
  ActionRow,
  AttachmentRow,
  IncidentRow,
  LocationRow,
  OrganizationRow,
  SafetyWalkItemRow,
  SafetyWalkRow,
  SiteRow,
} from "@/lib/supabase/database.types";
import type {
  CapaAction,
  Contact,
  Incident,
  IncidentAnalysis,
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
  TrackedIncident,
} from "@/lib/types";

type Nested<T> = T | T[] | null | undefined;

export interface IncidentQueryRow extends IncidentRow {
  sites?: Nested<Pick<SiteRow, "id" | "name" | "city">>;
  site_locations?: Nested<Pick<LocationRow, "id" | "name">>;
  actions?: Nested<ActionRow>;
  incident_attachments?: Nested<AttachmentRow>;
}

export interface SiteQueryRow extends SiteRow {
  organizations?: Nested<Pick<OrganizationRow, "id" | "name" | "organization_number" | "address">>;
  site_locations?: Nested<Pick<LocationRow, "id" | "name" | "sort_order">>;
}

export interface SafetyWalkQueryRow extends SafetyWalkRow {
  sites?: Nested<Pick<SiteRow, "id" | "name">>;
  safety_walk_items?: Nested<SafetyWalkItemRow>;
}

/** Resolves a storage path to a URL the browser can load (signed or public). */
export type MediaUrlResolver = (path: string) => string | null;

const noMedia: MediaUrlResolver = () => null;

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

function latestFirst(a: ActionRow, b: ActionRow) {
  return +new Date(b.updated_at ?? b.created_at ?? 0) - +new Date(a.updated_at ?? a.created_at ?? 0);
}

export function mapIncident(row: IncidentQueryRow, mediaUrl: MediaUrlResolver = noMedia): Incident {
  const site = unwrapOne(row.sites);
  const location = unwrapOne(row.site_locations);
  const actions = unwrapMany(row.actions).sort(latestFirst);
  const attachments = unwrapMany(row.incident_attachments);
  const voice = attachments.find((item) => item.kind === "voice");

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
      .map((item) => mediaUrl(item.storage_path))
      .filter((url): url is string => Boolean(url)),
    audioUrl: voice ? mediaUrl(voice.storage_path) : null,
    originalLanguage: row.original_language ?? null,
    originalText: row.original_text ?? null,
    summarySv: row.summary_sv ?? null,
    trackingCode: row.tracking_code ?? null,
    publicNote: row.public_note ?? null,
    aiAnalysis: parseAnalysis(row.ai_analysis),
    aiAnalysisLanguage: row.ai_analysis_language ?? null,
    aiAnalyzedAt: row.ai_analyzed_at ?? null,
    anonymous: Boolean(row.is_anonymous),
    reporterName: row.reporter_name,
    status: mapStatus(row.status),
    createdAt: row.created_at,
    capa: mapCapa(actions[0] ?? null),
    source: row.source === "skyddsrond" || (row.reference ?? "").startsWith("SR-") ? "skyddsrond" : "report",
  };
}

/** Every storage path an incident row references (for batch URL signing). */
export function incidentMediaPaths(row: IncidentQueryRow): string[] {
  return unwrapMany(row.incident_attachments).map((item) => item.storage_path);
}

export function mapSite(row: SiteQueryRow): Site {
  const org = unwrapOne(row.organizations);
  const locations = [...unwrapMany(row.site_locations)]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item) => ({ id: item.id, name: item.name }));

  return {
    id: row.id,
    name: row.name,
    city: row.city || "",
    address: row.address || org?.address || undefined,
    organizationId: row.organization_id || org?.id || undefined,
    organizationNumber: org?.organization_number || undefined,
    organizationName: org?.name,
    locations: locations.length ? locations : [{ id: row.id, name: row.name }],
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Tolerant parse of the stored assistant analysis (jsonb). */
export function parseAnalysis(value: unknown): IncidentAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.summary !== "string") return null;
  return {
    summary: raw.summary,
    rootCauses: stringList(raw.rootCauses),
    immediateActions: stringList(raw.immediateActions),
    preventiveActions: stringList(raw.preventiveActions),
    amlReportRequired: Boolean(raw.amlReportRequired),
    amlReason: typeof raw.amlReason === "string" ? raw.amlReason : "",
    riskLevel: mapSeverity(typeof raw.riskLevel === "string" ? raw.riskLevel : "medium"),
    meetingRecommended: Boolean(raw.meetingRecommended),
    meetingAgenda: stringList(raw.meetingAgenda),
  };
}

export function mapContact(row: { id: string; name: string; email: string; role: string | null }): Contact {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export function mapTracked(row: {
  reference: string;
  status: string;
  severity: string;
  created_at: string;
  updated_at: string | null;
  has_owner: boolean;
  due_date: string | null;
  public_note: string | null;
}): TrackedIncident {
  return {
    reference: row.reference,
    status: mapStatus(row.status),
    severity: mapSeverity(row.severity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasOwner: Boolean(row.has_owner),
    dueDate: row.due_date,
    publicNote: row.public_note,
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
  actionStatus: SafetyWalkItem["actionStatus"] = null,
  mediaUrl: MediaUrlResolver = noMedia
): SafetyWalkItem {
  return {
    id: row.id,
    walkId: row.safety_walk_id,
    itemKey: row.item_key,
    domain: mapWalkDomain(row.domain),
    title: row.title,
    status: mapWalkItemStatus(row.status),
    notes: row.notes ?? "",
    photoUrl: row.photo_path ? mediaUrl(row.photo_path) : null,
    sortOrder: row.sort_order ?? 0,
    actionStatus,
  };
}

export function walkMediaPaths(row: SafetyWalkQueryRow): string[] {
  return unwrapMany(row.safety_walk_items)
    .map((item) => item.photo_path)
    .filter((path): path is string => Boolean(path));
}

export function mapSafetyWalk(
  row: SafetyWalkQueryRow,
  actionByItemId: Map<string, ActionRow> = new Map(),
  mediaUrl: MediaUrlResolver = noMedia
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
      return mapWalkItem(item, actionStatus, mediaUrl);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: row.id,
    title: row.title,
    siteId: row.site_id,
    siteName: site?.name,
    skyddsombudName: row.skyddsombud_name || "—",
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
