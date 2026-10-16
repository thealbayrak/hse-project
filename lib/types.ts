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
}

export interface UpdateCapaInput {
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  status: IncidentStatus;
  notes: string;
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
