import type {
  Audit,
  MembershipRequest,
  MembershipRequestInput,
  Subcontractor,
  CreateOrganizationInput,
  CreateSiteInput,
  CreateStaffInput,
  CreateStaffResult,
  Organization,
  ReportKey,
  ReportTarget,
  RiskType,
  SiteLocation,
  ChecklistTemplate,
  Contact,
  CreateAuditInput,
  CreateIncidentInput,
  CreateTemplateInput,
  CreateSafetyWalkInput,
  CreateTaskInput,
  DashboardMetrics,
  Incident,
  IncidentAnalysis,
  IncidentStatus,
  Profile,
  ProfileImportRow,
  SafetyWalk,
  SafetyWalkSummary,
  Site,
  SitePerson,
  Task,
  TrackedIncident,
  UpdateAuditInput,
  UpdateCapaInput,
  UpdateTaskInput,
} from "@/lib/types";

export interface RealtimeIncidentEvent {
  event: "INSERT" | "UPDATE";
  id: string;
}

export type RealtimeIncidentHandler = (event: RealtimeIncidentEvent) => void;

export interface ImportResult {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
}

/**
 * Persistence-agnostic contract.
 * `createIncidentRepository()` selects Supabase when env vars exist, otherwise mock data.
 */
export interface IncidentRepository {
  listSites(): Promise<Site[]>;
  listIncidents(): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | null>;
  createIncident(input: CreateIncidentInput): Promise<Incident>;
  updateCapa(incidentId: string, capa: UpdateCapaInput): Promise<Incident>;
  /** Kanban move: status only, nothing else changes. */
  updateStatus(incidentId: string, status: IncidentStatus): Promise<Incident>;
  saveIncidentAnalysis(incidentId: string, analysis: IncidentAnalysis, language: string): Promise<Incident>;
  getMetrics(): Promise<DashboardMetrics>;
  getLatestSafetyWalk(): Promise<SafetyWalkSummary | null>;
  createSafetyWalk(input: CreateSafetyWalkInput): Promise<SafetyWalk>;
  /** Public lookup by tracking code; works without a session. */
  trackIncident(code: string): Promise<TrackedIncident | null>;
  listContacts(): Promise<Contact[]>;
  addContact(input: { name: string; email: string; role?: string | null }): Promise<Contact>;
  removeContact(id: string): Promise<void>;

  // People and roles
  /** Names only, for the worker picking themselves on the report form; no login needed. */
  listSitePeople(siteId: string): Promise<SitePerson[]>;
  listProfiles(): Promise<Profile[]>;
  /** The signed-in person's profile, matched by e-mail; null when not in the people list. */
  getProfileByEmail(email: string): Promise<Profile | null>;
  importProfiles(rows: ProfileImportRow[]): Promise<ImportResult>;
  updateProfile(id: string, patch: Partial<Omit<Profile, "id">>): Promise<Profile>;
  removeProfile(id: string): Promise<void>;

  // Tasks
  listTasks(): Promise<Task[]>;
  createTask(input: CreateTaskInput, createdById: string | null): Promise<Task>;
  updateTask(id: string, patch: UpdateTaskInput): Promise<Task>;

  // Checklist templates and audits
  listTemplates(): Promise<ChecklistTemplate[]>;
  createTemplate(input: CreateTemplateInput, createdById: string | null): Promise<ChecklistTemplate>;
  updateTemplate(id: string, patch: Partial<CreateTemplateInput & { active: boolean }>): Promise<ChecklistTemplate>;
  listAudits(): Promise<Audit[]>;
  createAudit(input: CreateAuditInput, createdById: string | null): Promise<Audit>;
  /** Saves answers; with status "submitted" every failed item becomes a hazard with its due date and owner. */
  updateAudit(id: string, patch: UpdateAuditInput): Promise<Audit>;

  // Companies and their settings (owner and managers)
  listOrganizations(): Promise<Organization[]>;
  createOrganization(input: CreateOrganizationInput): Promise<Organization>;
  updateOrganization(id: string, patch: Partial<CreateOrganizationInput & { active: boolean }>): Promise<Organization>;
  createSite(input: CreateSiteInput): Promise<Site>;
  updateSite(id: string, patch: { name?: string; city?: string | null; address?: string | null; active?: boolean }): Promise<void>;
  createLocation(siteId: string, name: string): Promise<SiteLocation>;
  removeLocation(id: string): Promise<void>;
  /** Public: the report form reads a company's own risk types without a login. */
  listRiskTypes(organizationId?: string | null): Promise<RiskType[]>;
  createRiskType(organizationId: string, label: string): Promise<RiskType>;
  removeRiskType(id: string): Promise<void>;
  listSubcontractors(organizationId?: string | null): Promise<Subcontractor[]>;
  createSubcontractor(organizationId: string, name: string): Promise<Subcontractor>;
  removeSubcontractor(id: string): Promise<void>;
  /** Public: a reporter leaves an e-mail to become a permanent user; a manager approves it later. */
  requestMembership(input: MembershipRequestInput): Promise<"requested" | "already_member">;
  listMembershipRequests(): Promise<MembershipRequest[]>;
  decideMembership(id: string, status: "approved" | "rejected", decidedBy: string | null): Promise<void>;
  /** Public: what a QR code points to; null when the key is unknown or has been replaced. */
  resolveReportKey(key: string): Promise<ReportTarget | null>;
  /** Managers: the current QR keys of their company and its places. */
  listReportKeys(): Promise<ReportKey[]>;
  /** Replaces the QR key of a company (no siteId) or one place; the old code stops working. */
  rotateReportKey(scope: { siteId?: string | null; organizationId?: string | null }): Promise<string>;
  /** People of a company for the reporter picker (no contact details). */
  listOrgPeople(organizationId: string): Promise<SitePerson[]>;
  /** Adds a person; with e-mail and password they also get a login. */
  createStaff(input: CreateStaffInput): Promise<CreateStaffResult>;

  subscribeToIncidents?(handler: RealtimeIncidentHandler): () => void;

  /** Demo only: shows the data as this person would see it (their company, places and role). */
  setDemoViewer?(viewer: Profile | null): void;
}
