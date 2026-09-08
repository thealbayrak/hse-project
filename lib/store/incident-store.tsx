"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { dispatchCriticalIncidentAlert } from "@/lib/alerts/critical-incident";
import { createIncidentRepository } from "@/lib/data/factory";
import { computeMetrics, sortIncidents } from "@/lib/data/metrics";
import type { IncidentRepository } from "@/lib/data/repository";
import { SEED_INCIDENTS } from "@/lib/data/seed-incidents";
import { SEED_SAFETY_WALKS } from "@/lib/data/seed-walks";
import { SITES } from "@/lib/data/sites";
import { typeLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { playAlertChime } from "@/lib/audio";
import { toSafetyWalkSummary } from "@/lib/supabase/mappers";
import { isSupabaseConfigured } from "@/lib/supabase/env";
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

interface IncidentStoreValue {
  incidents: Incident[];
  sites: Site[];
  metrics: DashboardMetrics;
  latestSafetyWalk: SafetyWalkSummary | null;
  loading: boolean;
  error: string | null;
  usingSupabase: boolean;
  highlightedIds: string[];
  createIncident: (input: CreateIncidentInput) => Promise<Incident>;
  updateCapa: (incidentId: string, capa: UpdateCapaInput) => Promise<Incident>;
  createSafetyWalk: (input: CreateSafetyWalkInput) => Promise<SafetyWalk>;
  refresh: () => Promise<void>;
}

const IncidentStoreContext = createContext<IncidentStoreValue | null>(null);

const usingSupabase = isSupabaseConfigured();

const EMPTY_METRICS: DashboardMetrics = {
  totalReports: 0,
  openActions: 0,
  criticalNearMisses: 0,
  daysIncidentFree: 0,
};

export function IncidentProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLanguage();
  const repositoryRef = useRef<IncidentRepository>(createIncidentRepository());
  const [incidents, setIncidents] = useState<Incident[]>(() =>
    usingSupabase ? [] : sortIncidents(structuredClone(SEED_INCIDENTS))
  );
  const [sites, setSites] = useState<Site[]>(() => (usingSupabase ? [] : structuredClone(SITES)));
  const [metrics, setMetrics] = useState<DashboardMetrics>(() =>
    usingSupabase ? EMPTY_METRICS : computeMetrics(SEED_INCIDENTS)
  );
  const [latestSafetyWalk, setLatestSafetyWalk] = useState<SafetyWalkSummary | null>(() =>
    usingSupabase ? null : toSafetyWalkSummary(SEED_SAFETY_WALKS[0])
  );
  const [loading, setLoading] = useState(usingSupabase);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const repo = repositoryRef.current;
    try {
      const [nextIncidents, nextSites, nextMetrics, nextWalk] = await Promise.all([
        repo.listIncidents(),
        repo.listSites(),
        repo.getMetrics(),
        repo.getLatestSafetyWalk().catch(() => null),
      ]);
      setIncidents(nextIncidents);
      setSites(nextSites);
      setMetrics(nextMetrics);
      setLatestSafetyWalk(nextWalk);
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load safety data.";
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      // Error is stored for the UI.
    });
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = repositoryRef.current.subscribeToIncidents?.(async (event) => {
      try {
        const incident = await repositoryRef.current.getIncident(event.id);
        if (!incident) {
          await refresh();
          return;
        }

        setIncidents((current) => {
          const exists = current.some((item) => item.id === incident.id);
          const next = exists
            ? current.map((item) => (item.id === incident.id ? incident : item))
            : [incident, ...current];
          setMetrics(computeMetrics(next));
          return next;
        });

        if (event.event === "INSERT") {
          setHighlightedIds((current) =>
            current.includes(incident.id) ? current : [incident.id, ...current]
          );
          playAlertChime();
          toast.message(`${typeLabel(incident.type, locale)}`, {
            description: incident.reference,
          });
          window.setTimeout(() => {
            setHighlightedIds((current) => current.filter((id) => id !== incident.id));
          }, 8000);
        }
      } catch {
        void refresh().catch(() => undefined);
      }
    });

    return () => unsubscribe?.();
  }, [locale, refresh]);

  const createIncident = useCallback(
    async (input: CreateIncidentInput) => {
      const created = await repositoryRef.current.createIncident(input);
      dispatchCriticalIncidentAlert(created);
      await refresh().catch(() => undefined);
      return created;
    },
    [refresh]
  );

  const createSafetyWalk = useCallback(
    async (input: CreateSafetyWalkInput) => {
      const created = await repositoryRef.current.createSafetyWalk(input);
      setLatestSafetyWalk(toSafetyWalkSummary(created));
      await refresh().catch(() => undefined);
      return created;
    },
    [refresh]
  );

  const updateCapa = useCallback(
    async (incidentId: string, capa: UpdateCapaInput) => {
      const updated = await repositoryRef.current.updateCapa(incidentId, capa);
      await refresh().catch(() => undefined);
      return updated;
    },
    [refresh]
  );

  const value = useMemo(
    () => ({
      incidents,
      sites,
      metrics,
      latestSafetyWalk,
      loading,
      error,
      usingSupabase,
      highlightedIds,
      createIncident,
      updateCapa,
      createSafetyWalk,
      refresh,
    }),
    [
      incidents,
      sites,
      metrics,
      latestSafetyWalk,
      loading,
      error,
      highlightedIds,
      createIncident,
      updateCapa,
      createSafetyWalk,
      refresh,
    ]
  );

  return (
    <IncidentStoreContext.Provider value={value}>{children}</IncidentStoreContext.Provider>
  );
}

export function useIncidentStore() {
  const context = useContext(IncidentStoreContext);
  if (!context) {
    throw new Error("useIncidentStore must be used within IncidentProvider");
  }
  return context;
}
