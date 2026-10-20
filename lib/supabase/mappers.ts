import type {
  ActionRow,
  AttachmentRow,
  AuditRow,
  IncidentRow,
  LocationRow,
  OrganizationRow,
  ProfileRow,
  SafetyWalkItemRow,
  SafetyWalkRow,
  SiteRow,
  RiskTypeRow,
  TaskRow,
  TemplateRow,
} from "@/lib/supabase/database.types";
import type {
  Audit,
  AuditItemResult,
  AuditStatus,
  CapaAction,
  ChecklistItem,
  ChecklistTemplate,
  Contact,
  Organization,
  RiskType,
  Incident,
  IncidentAnalysis,
  IncidentStatus,
  Profile,
  Role,
  Task,
  TaskPriority,
  TaskStatus,
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
  site_locations?: Nested<Pick<LocationRow, "id" | "name" | "sort_order" | "latitude" | "longitude">>;
}

export interface ProfileQueryRow extends ProfileRow {
  sites?: Nested<Pick<SiteRow, "id" | "name">>;
  manager?: Nested<Pick<ProfileRow, "id" | "full_name">>;
}

export interface TaskQueryRow extends TaskRow {
  assignee?: Nested<Pick<ProfileRow, "id" | "full_name">>;
  creator?: Nested<Pick<ProfileRow, "id" | "full_name">>;
  incidents?: Nested<Pick<IncidentRow, "id" | "reference">>;
}

export interface AuditQueryRow extends AuditRow {
  sites?: Nested<Pick<SiteRow, "id" | "name">>;
  assignee?: Nested<Pick<ProfileRow, "id" | "full_name">>;
  creator?: Nested<Pick<ProfileRow, "id" | "full_name">>;
  incidents?: Nested<Pick<IncidentRow, "id" | "reference" | "status">>;
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
  if (normalized === "good-observation") return "good-observation";
  if (normalized === "positive-observation") return "positive-observation";
  if (normalized === "environmental" || normalized === "environmental-incident") return "environmental";
  if (normalized === "accident" || normalized === "olycka" || normalized === "olycksfall") return "accident";
  return "other";
}

const KNOWN_CATEGORIES: RiskCategory[] = [
  "falls",
  "machine",
  "falling-objects",
  "slip-trip",
  "chemical",
  "electrical",
  "ergonomic",
  "ppe",
  "fire",
  "traffic",
  "confined-space",
  "noise-vibration",
  "dust-air",
  "housekeeping",
  "environment-spill",
  "psychosocial",
  "other",
  "unclassified",
];

export function mapCategories(values: unknown): RiskCategory[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => mapCategory(value))
    .filter((value) => value !== "unclassified");
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

/** Built-in keys are normalised; anything else is a company's own risk type and kept as written. */
export function mapCategory(value: string | null | undefined): RiskCategory {
  const raw = (value ?? "").trim();
  const normalized = raw.toLowerCase().replaceAll("_", "-");
  if (!normalized) return "unclassified";
  return KNOWN_CATEGORIES.includes(normalized as RiskCategory) ? (normalized as RiskCategory) : raw.slice(0, 80);
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
    typeNote: row.type_note ?? null,
    siteId: row.site_id ?? "",
    organizationId: row.organization_id ?? null,
    locationNote: row.location_note ?? null,
    locationId: row.location_id ?? location?.id ?? "",
    siteName: site?.name ?? undefined,
    locationName: location?.name ?? row.location ?? undefined,
    locationIds: Array.isArray(row.location_ids) && row.location_ids.length ? row.location_ids : row.location_id ? [row.location_id] : [],
    category: mapCategories(row.categories)[0] ?? mapCategory(row.category),
    categories: mapCategories(row.categories).length ? mapCategories(row.categories) : mapCategory(row.category) === "unclassified" ? [] : [mapCategory(row.category)],
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
    reporterProfileId: row.reporter_profile_id ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    anonymous: Boolean(row.is_anonymous),
    reporterName: row.reporter_name,
    status: mapStatus(row.status),
    createdAt: row.created_at,
    capa: mapCapa(actions[0] ?? null),
    source:
      row.source === "audit"
        ? "audit"
        : row.source === "skyddsrond" || (row.reference ?? "").startsWith("SR-")
          ? "skyddsrond"
          : "report",
    auditId: row.audit_id ?? null,
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
    .map((item) => ({ id: item.id, name: item.name, latitude: item.latitude ?? null, longitude: item.longitude ?? null }));

  return {
    id: row.id,
    name: row.name,
    city: row.city || "",
    address: row.address || org?.address || undefined,
    organizationId: row.organization_id || org?.id || undefined,
    organizationNumber: org?.organization_number || undefined,
    organizationName: org?.name,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    active: row.active ?? true,
    locations,
  };
}

export function mapRole(value: string): Role {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "foreman" || normalized === "supervisor" || normalized === "arbetsledare" || normalized === "şef" || normalized === "sef") return "foreman";
  if (normalized === "safety_officer" || normalized === "skyddsombud" || normalized === "officer" || normalized === "isg_uzmani" || normalized === "isg_uzmanı") return "safety_officer";
  if (normalized === "hse_manager" || normalized === "manager" || normalized === "arbetsmiljöchef" || normalized === "isg_muduru" || normalized === "isg_müdürü") return "hse_manager";
  if (normalized === "super_admin" || normalized === "superadmin" || normalized === "süper_admin" || normalized === "superadministrator") return "super_admin";
  if (normalized === "admin" || normalized === "administrator") return "admin";
  return "worker";
}

// ---------------------------------------------------------------------------
// Checklist templates and audits
// ---------------------------------------------------------------------------

export function mapChecklistItems(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): ChecklistItem | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!title) return null;
      return {
        key: typeof record.key === "string" && record.key ? record.key : `item-${index + 1}`,
        title,
        hint: typeof record.hint === "string" && record.hint ? record.hint : undefined,
      };
    })
    .filter((item): item is ChecklistItem => item !== null);
}

export function mapTemplate(row: TemplateRow): ChecklistTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    items: mapChecklistItems(row.items),
    active: row.active,
    createdById: row.created_by,
    createdAt: row.created_at,
  };
}

export function mapAuditStatus(value: string): AuditStatus {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "in-progress") return "in-progress";
  if (normalized === "submitted") return "submitted";
  if (normalized === "done" || normalized === "completed") return "done";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  return "assigned";
}

export function mapAuditItems(value: unknown): AuditItemResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): AuditItemResult | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title : "";
      if (!title) return null;
      const status = record.status === "ok" || record.status === "fail" || record.status === "na" ? record.status : null;
      return {
        key: typeof record.key === "string" && record.key ? record.key : `item-${index + 1}`,
        title,
        status,
        note: typeof record.note === "string" ? record.note : "",
        dueDate: typeof record.dueDate === "string" && record.dueDate ? record.dueDate : null,
        assigneeId: typeof record.assigneeId === "string" && record.assigneeId ? record.assigneeId : null,
        assigneeName: typeof record.assigneeName === "string" ? record.assigneeName : null,
        incidentId: typeof record.incidentId === "string" && record.incidentId ? record.incidentId : null,
        incidentReference: typeof record.incidentReference === "string" ? record.incidentReference : null,
        incidentStatus: null,
      };
    })
    .filter((item): item is AuditItemResult => item !== null);
}

export function mapAudit(row: AuditQueryRow): Audit {
  const site = unwrapOne(row.sites);
  const assignee = unwrapOne(row.assignee);
  const creator = unwrapOne(row.creator);
  const linked = unwrapMany(row.incidents);
  const statusById = new Map(linked.map((incident) => [incident.id, mapStatus(incident.status)]));
  const items = mapAuditItems(row.items).map((item) => ({
    ...item,
    incidentStatus: item.incidentId ? (statusById.get(item.incidentId) ?? null) : null,
  }));
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    siteId: row.site_id,
    siteName: site?.name ?? null,
    assigneeId: row.assignee_id,
    assigneeName: assignee?.full_name ?? null,
    createdById: row.created_by,
    createdByName: creator?.full_name ?? null,
    dueDate: row.due_date,
    status: mapAuditStatus(row.status),
    items,
    note: row.note ?? "",
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    openNonConformities: linked.filter((incident) => mapStatus(incident.status) !== "resolved").length,
  };
}

export function mapProfile(row: ProfileQueryRow): Profile {
  const site = unwrapOne(row.sites);
  const manager = unwrapOne(row.manager);
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: mapRole(row.role),
    organizationId: row.organization_id,
    siteId: row.site_id,
    siteName: site?.name ?? null,
    employeeNo: row.employee_no,
    reportsTo: row.reports_to,
    reportsToName: manager?.full_name ?? null,
    language: row.language,
    active: row.active,
  };
}

export function mapTaskStatus(value: string): TaskStatus {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "in-progress") return "in-progress";
  if (normalized === "done" || normalized === "completed") return "done";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  return "open";
}

export function mapTaskPriority(value: string): TaskPriority {
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "high" || normalized === "urgent") return normalized;
  return "normal";
}

export function mapTask(row: TaskQueryRow): Task {
  const assignee = unwrapOne(row.assignee);
  const creator = unwrapOne(row.creator);
  const incident = unwrapOne(row.incidents);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    priority: mapTaskPriority(row.priority),
    status: mapTaskStatus(row.status),
    assigneeId: row.assignee_id,
    assigneeName: assignee?.full_name ?? null,
    createdById: row.created_by,
    createdByName: creator?.full_name ?? null,
    siteId: row.site_id,
    incidentId: row.incident_id,
    incidentReference: incident?.reference ?? null,
    dueDate: row.due_date,
    feedback: row.feedback ?? "",
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

export function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    organizationNumber: row.organization_number ?? null,
    address: row.address ?? null,
    industry: row.industry ?? null,
    active: row.active ?? true,
  };
}

export function mapRiskType(row: RiskTypeRow): RiskType {
  return { id: row.id, organizationId: row.organization_id, label: row.label, active: row.active };
}
