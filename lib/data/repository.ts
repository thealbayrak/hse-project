import type {
  Contact,
  CreateIncidentInput,
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

  subscribeToIncidents?(handler: RealtimeIncidentHandler): () => void;
}
