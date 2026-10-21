export type IncidentType =
  | "near-miss"
  | "hazard"
  | "accident"
  | "good-observation"
  | "positive-observation"
  | "environmental"
  | "other";
/** "unrated" = waiting for a manager to rate it ("Pending review"). Only managers set the other levels. */
export type Severity = "unrated" | "low" | "medium" | "high" | "critical";
export type RatedSeverity = Exclude<Severity, "unrated">;
export type IncidentStatus = "open" | "in-progress" | "resolved";
/** Built-in risk types; companies add their own (stored as plain text). */
export type BuiltInRiskCategory =
  | "falls"
  | "machine"
  | "falling-objects"
  | "slip-trip"
  | "chemical"
  | "electrical"
  | "ergonomic"
  | "ppe"
  | "fire"
  | "traffic"
  | "confined-space"
  | "noise-vibration"
  | "dust-air"
  | "housekeeping"
  | "environment-spill"
  | "psychosocial"
  | "other"
  | "unclassified";

/** A built-in key or a company's own risk type label. "unclassified" means nobody picked one yet. */
export type RiskCategory = BuiltInRiskCategory | (string & {});

/** Report types that praise good practice rather than flag danger. */
export const POSITIVE_TYPES: IncidentType[] = ["good-observation", "positive-observation"];
export function isPositiveType(type: IncidentType) {
  return POSITIVE_TYPES.includes(type);
}

export interface SiteLocation {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Site {
  id: string;
  name: string;
  city: string;
  address?: string;
  organizationId?: string;
  organizationNumber?: string;
  organizationName?: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Hidden from the report form when false. */
  active?: boolean;
  locations: SiteLocation[];
}

export interface CapaAction {
  id?: string;
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  status: IncidentStatus;
  notes: string;
  updatedAt: string;
}

export interface Incident {
  id: string;
  reference: string;
  type: IncidentType;
  /** Empty when the reporter did not pick a site (only the company is known). */
  siteId: string;
  locationId: string;
  siteName?: string;
  locationName?: string;
  /** Company (tenant) the report belongs to. */
  organizationId?: string | null;
  /** Free-text place or area the reporter typed when it was not in the list. */
  locationNote?: string | null;
  /** Free-text type when the reporter chose "other". */
  typeNote?: string | null;
  /** The reporter's own answers, kept as facts; the severity itself is rated by a manager. */
  hurt?: boolean | null;
  dangerPresent?: boolean | null;
  /** Subcontractor / company the reporter works for, when given. */
  subcontractor?: string | null;
  /** All areas the reporter marked; `locationId` is the first of them (may be empty). */
  locationIds?: string[];
  /** First risk type, or "unclassified" until the safety team assigns one. */
  category: RiskCategory;
  /** All risk types; empty when not classified yet. */
  categories?: RiskCategory[];
  severity: Severity;
  description: string;
  mediaUrls: string[];
  audioUrl?: string | null;
  /** ISO 639-1 code of the language the worker reported in (set by the assistant). */
  originalLanguage?: string | null;
  /** The worker's own words when the description was summarised. */
  originalText?: string | null;
  /** Neutral Swedish summary for the safety organisation. */
  summarySv?: string | null;
  /** Code the reporter uses on /track; only returned to the reporter at creation. */
  trackingCode?: string | null;
  /** Officer's note that the reporter can read on /track. */
  publicNote?: string | null;
  /** Assistant analysis for the safety officer (root causes, actions, AML advice). */
  aiAnalysis?: IncidentAnalysis | null;
  aiAnalysisLanguage?: string | null;
  aiAnalyzedAt?: string | null;
  /** The person who reported (from the people list), when not anonymous. */
  reporterProfileId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  anonymous: boolean;
  reporterName: string | null;
  status: IncidentStatus;
  createdAt: string;
  capa: CapaAction | null;
  source?: "report" | "skyddsrond" | "audit";
  /** Set when a failed checklist item raised this non-conformity. */
  auditId?: string | null;
  /** True for a report stored on the device while offline; it has no reference yet. */
  pending?: boolean;
}

/** Every risk type on an incident (legacy rows carry only the single one). */
export function incidentCategories(incident: Pick<Incident, "category" | "categories">): RiskCategory[] {
  if (incident.categories?.length) return incident.categories;
  return incident.category === "unclassified" ? [] : [incident.category];
}

export interface CreateIncidentInput {
  type: IncidentType;
  /** "" when no site was picked; then organizationId says which company it is for. */
  siteId: string;
  organizationId?: string | null;
  locationNote?: string | null;
  typeNote?: string | null;
  hurt?: boolean | null;
  dangerPresent?: boolean | null;
  subcontractor?: string | null;
  /** First area, or "" when the reporter did not pick one. */
  locationId: string;
  locationIds?: string[];
  /** First risk type, "unclassified" when none was picked. */
  category: RiskCategory;
  categories?: RiskCategory[];
  severity: Severity;
  description: string;
  mediaUrls: string[];
  photoFiles?: File[];
  audioFile?: Blob | null;
  anonymous: boolean;
  reporterName: string | null;
  originalLanguage?: string | null;
  originalText?: string | null;
  summarySv?: string | null;
  aiConfidence?: number | null;
  reporterProfileId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** What a reporter sees on /track with their code. */
export interface TrackedIncident {
  reference: string;
  status: IncidentStatus;
  severity: Severity;
  createdAt: string;
  updatedAt: string | null;
  hasOwner: boolean;
  dueDate: string | null;
  publicNote: string | null;
}

export interface UpdateCapaInput {
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  status: IncidentStatus;
  notes: string;
  /** Optional correction of the reporter-derived severity by the safety officer. */
  severity?: Severity;
  /** Risk types assigned or corrected by the safety officer. */
  categories?: RiskCategory[];
  /** Short message the reporter can read on /track. */
  publicNote?: string;
}

export interface DashboardMetrics {
  totalReports: number;
  openActions: number;
  criticalNearMisses: number;
  daysIncidentFree: number;
}

export interface SafetyOfficer {
  id: string;
  name: string;
  role: string;
}

export interface ReportDraft {
  type: IncidentType | null;
  typeNote: string;
  siteId: string;
  /** Typed place when it is not in the list. */
  placeNote: string;
  locationIds: string[];
  /** Typed areas when they are not in the list. */
  areaNotes: string[];
  categories: RiskCategory[];
  severity: Severity | null;
  description: string;
  mediaUrls: string[];
  photoFiles: File[];
  audioFile: Blob | null;
  anonymous: boolean;
}

export type SafetyWalkItemStatus = "ok" | "deviation" | "na";
export type SafetyWalkDomainId =
  | "fall-protection"
  | "order-cleanliness"
  | "scaffolding-ladders"
  | "ppe"
  | "emergency-fire";

export interface SafetyWalkItem {
  id: string;
  walkId: string;
  itemKey: string;
  domain: SafetyWalkDomainId;
  title: string;
  status: SafetyWalkItemStatus;
  notes: string;
  photoUrl: string | null;
  sortOrder: number;
  actionStatus?: IncidentStatus | "pending" | null;
}

export interface SafetyWalk {
  id: string;
  title: string;
  siteId: string;
  siteName?: string;
  skyddsombudName: string;
  skyddsombudRole: string;
  completedAt: string;
  items: SafetyWalkItem[];
}

export interface SafetyWalkSummary {
  id: string;
  title: string;
  siteId: string;
  siteName?: string;
  skyddsombudName: string;
  skyddsombudRole: string;
  completedAt: string;
  deviationCount: number;
  activeDeviations: number;
  resolvedDeviations: number;
}

export interface CreateSafetyWalkItemInput {
  itemKey: string;
  domain: SafetyWalkDomainId;
  title: string;
  status: SafetyWalkItemStatus;
  notes: string;
  photoFile?: File | null;
  sortOrder: number;
}

export interface CreateSafetyWalkInput {
  title: string;
  siteId: string;
  skyddsombudName: string;
  skyddsombudRole: string;
  items: CreateSafetyWalkItemInput[];
}

/** Officer-side assistant output, stored on the incident. */
export interface IncidentAnalysis {
  summary: string;
  rootCauses: string[];
  immediateActions: string[];
  preventiveActions: string[];
  amlReportRequired: boolean;
  amlReason: string;
  riskLevel: Severity;
  meetingRecommended: boolean;
  meetingAgenda: string[];
}

/** Assistant-written management report over a set of incidents. */
export interface AiReport {
  title: string;
  summary: string;
  keyFigures: { label: string; value: string }[];
  trends: string[];
  topRisks: { risk: string; count: number; comment: string }[];
  hotspots: string[];
  recommendations: string[];
  positives: string[];
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

export interface MeetingInviteInput {
  incidentId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  location: string;
  note: string;
  recipients: { name: string; email: string }[];
}

/** Roles decide who is told about what and which screens a person sees. */
export type Role = "worker" | "foreman" | "action_owner" | "safety_officer" | "hse_manager" | "admin" | "super_admin";

export const ROLES: Role[] = ["worker", "foreman", "action_owner", "safety_officer", "hse_manager", "admin", "super_admin"];

export interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  /** Tenant. People, reports and tasks are only visible inside it (super admins see all). */
  organizationId?: string | null;
  siteId: string | null;
  siteName?: string | null;
  employeeNo: string | null;
  reportsTo: string | null;
  reportsToName?: string | null;
  language: string | null;
  active: boolean;
}

/** What the people import accepts per row (Excel / CSV). */
export interface ProfileImportRow {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role?: Role | null;
  siteName?: string | null;
  employeeNo?: string | null;
  reportsToEmail?: string | null;
  reportsToName?: string | null;
  language?: string | null;
}

/** Minimal person record shown to workers on the report form (no contact details). */
export interface SitePerson {
  id: string;
  fullName: string;
  role: Role;
  employeeNo: string | null;
}

export type TaskStatus = "open" | "in-progress" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName?: string | null;
  createdById: string | null;
  createdByName?: string | null;
  siteId: string | null;
  incidentId: string | null;
  incidentReference?: string | null;
  dueDate: string | null;
  feedback: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId: string | null;
  siteId: string | null;
  incidentId: string | null;
  dueDate: string | null;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  feedback?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
}

// ---------------------------------------------------------------------------
// Checklist templates and audits
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  key: string;
  title: string;
  hint?: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string;
  items: ChecklistItem[];
  active: boolean;
  createdById: string | null;
  createdAt: string;
}

export interface CreateTemplateInput {
  name: string;
  description: string;
  items: ChecklistItem[];
}

export type AuditStatus = "assigned" | "in-progress" | "submitted" | "done" | "cancelled";
export type AuditItemStatus = "ok" | "fail" | "na";

/** One checklist line as answered during the inspection. */
export interface AuditItemResult {
  key: string;
  title: string;
  status: AuditItemStatus | null;
  note: string;
  /** For a failed item: when it must be fixed and by whom. */
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName?: string | null;
  /** The non-conformity raised in the hazard list, once submitted. */
  incidentId: string | null;
  incidentReference?: string | null;
  incidentStatus?: IncidentStatus | null;
}

export interface Audit {
  id: string;
  templateId: string | null;
  templateName: string;
  siteId: string | null;
  siteName?: string | null;
  assigneeId: string | null;
  assigneeName?: string | null;
  createdById: string | null;
  createdByName?: string | null;
  dueDate: string | null;
  status: AuditStatus;
  items: AuditItemResult[];
  note: string;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Failed items whose hazard is still open; the audit cannot close while > 0. */
  openNonConformities: number;
}

export interface CreateAuditInput {
  templateId: string;
  siteId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
}

export interface UpdateAuditInput {
  status?: AuditStatus;
  items?: AuditItemResult[];
  note?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
}

// ---------------------------------------------------------------------------
// Companies, settings, staff
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  organizationNumber: string | null;
  address: string | null;
  industry: string | null;
  active: boolean;
}

export interface CreateOrganizationInput {
  name: string;
  organizationNumber?: string | null;
  address?: string | null;
  industry?: string | null;
}

export interface RiskType {
  id: string;
  organizationId: string;
  label: string;
  active: boolean;
}

export interface CreateSiteInput {
  organizationId: string;
  name: string;
  city?: string | null;
  address?: string | null;
}

export interface CreateStaffInput {
  fullName: string;
  role: Role;
  organizationId?: string | null;
  siteId?: string | null;
  email?: string | null;
  /** Given only when the person should be able to sign in. */
  password?: string | null;
  phone?: string | null;
  employeeNo?: string | null;
}

export interface CreateStaffResult {
  profile: Profile;
  /** created: can sign in now; confirm: must confirm the e-mail first; existing: account already existed; none: no login. */
  login: "created" | "confirm" | "existing" | "none";
}

// ---------------------------------------------------------------------------
// Subcontractors and join requests
// ---------------------------------------------------------------------------

export interface Subcontractor {
  id: string;
  organizationId: string;
  name: string;
  active: boolean;
}

export type MembershipStatus = "pending" | "approved" | "rejected";

/** A reporter who left an e-mail to become a permanent user; waits for a manager. */
export interface MembershipRequest {
  id: string;
  organizationId: string;
  siteId: string | null;
  fullName: string | null;
  email: string;
  status: MembershipStatus;
  createdAt: string;
}

export interface MembershipRequestInput {
  organizationId: string;
  email: string;
  name?: string | null;
  siteId?: string | null;
}

export interface NearbyPlace {
  name: string;
  kind: "hospital" | "pharmacy" | "clinic";
  latitude: number;
  longitude: number;
  distanceKm: number;
  phone: string | null;
  address: string | null;
}
