export type IncidentType = "near-miss" | "hazard" | "accident";
export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "in-progress" | "resolved";
export type RiskCategory =
  | "falls"
  | "machine"
  | "falling-objects"
  | "slip-trip"
  | "chemical"
  | "electrical"
  | "ergonomic";

export interface SiteLocation {
  id: string;
  name: string;
}

export interface Site {
  id: string;
  name: string;
  city: string;
  address?: string;
  organizationId?: string;
  organizationNumber?: string;
  organizationName?: string;
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
  siteId: string;
  locationId: string;
  siteName?: string;
  locationName?: string;
  category: RiskCategory;
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
  anonymous: boolean;
  reporterName: string | null;
  status: IncidentStatus;
  createdAt: string;
  capa: CapaAction | null;
  source?: "report" | "skyddsrond";
  /** True for a report stored on the device while offline; it has no reference yet. */
  pending?: boolean;
}

export interface CreateIncidentInput {
  type: IncidentType;
  siteId: string;
  locationId: string;
  category: RiskCategory;
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
  siteId: string;
  locationId: string;
  category: RiskCategory | null;
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
