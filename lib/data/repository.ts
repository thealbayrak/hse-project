import type {
  Contact,
  CreateIncidentInput,
  CreateSafetyWalkInput,
  DashboardMetrics,
  Incident,
  IncidentAnalysis,
  IncidentStatus,
  SafetyWalk,
  SafetyWalkSummary,
  Site,
  TrackedIncident,
  UpdateCapaInput,
} from "@/lib/types";

export interface RealtimeIncidentEvent {
  event: "INSERT" | "UPDATE";
  id: string;
}

export type RealtimeIncidentHandler = (event: RealtimeIncidentEvent) => void;

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
  subscribeToIncidents?(handler: RealtimeIncidentHandler): () => void;
}
