import type {
  CreateIncidentInput,
  CreateSafetyWalkInput,
  DashboardMetrics,
  Incident,
  SafetyWalk,
  SafetyWalkSummary,
  Site,
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
  getMetrics(): Promise<DashboardMetrics>;
  getLatestSafetyWalk(): Promise<SafetyWalkSummary | null>;
  createSafetyWalk(input: CreateSafetyWalkInput): Promise<SafetyWalk>;
  subscribeToIncidents?(handler: RealtimeIncidentHandler): () => void;
}
