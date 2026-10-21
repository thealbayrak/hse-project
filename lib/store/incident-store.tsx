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
import { notifyAssignment } from "@/lib/alerts/assignment";
import { dispatchCriticalIncidentAlert } from "@/lib/alerts/critical-incident";
import { useAuth } from "@/lib/auth/auth-context";
import { DEFAULT_SIGNED_IN_ROLE } from "@/lib/auth/permissions";
import { createIncidentRepository } from "@/lib/data/factory";
import { computeMetrics, sortIncidents } from "@/lib/data/metrics";
import type { ImportResult, IncidentRepository } from "@/lib/data/repository";
import { SEED_INCIDENTS } from "@/lib/data/seed-incidents";
import { SEED_SAFETY_WALKS } from "@/lib/data/seed-walks";
import { SITES } from "@/lib/data/sites";
import { typeLabel } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { playAlertChime } from "@/lib/audio";
import {
  countQueuedReports,
  enqueueReport,
  isNetworkError,
  listQueuedReports,
  markAttempt,
  offlineQueueSupported,
  removeQueuedReport,
  toCreateIncidentInput,
} from "@/lib/offline/report-queue";
import { toSafetyWalkSummary } from "@/lib/supabase/mappers";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  Audit,
  MembershipRequest,
  MembershipRequestInput,
  ReportKey,
  ReportTarget,
  Subcontractor,
  ChecklistTemplate,
  CreateOrganizationInput,
  CreateSiteInput,
  CreateStaffInput,
  CreateStaffResult,
  Organization,
  RiskType,
  SiteLocation,
  Contact,
  CreateAuditInput,
  CreateIncidentInput,
  CreateSafetyWalkInput,
  CreateTaskInput,
  CreateTemplateInput,
  DashboardMetrics,
  Incident,
  IncidentAnalysis,
  IncidentStatus,
  Profile,
  ProfileImportRow,
  Role,
  SafetyWalk,
  SitePerson,
  Task,
  UpdateTaskInput,
  SafetyWalkSummary,
  Site,
  TrackedIncident,
  UpdateAuditInput,
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
  /** True when the current visitor may read incidents (signed in, or demo mode). */
  canReadIncidents: boolean;
  highlightedIds: string[];
  /** Reports stored on this device that still wait for a connection. */
  pendingCount: number;
  createIncident: (input: CreateIncidentInput) => Promise<Incident>;
  updateCapa: (incidentId: string, capa: UpdateCapaInput) => Promise<Incident>;
  createSafetyWalk: (input: CreateSafetyWalkInput) => Promise<SafetyWalk>;
  trackIncident: (code: string) => Promise<TrackedIncident | null>;
  /** Profile of the signed-in person (undefined while resolving, null when not in the people list). */
  profile: Profile | null | undefined;
  /** Why the profile could not be read (a database error), as opposed to simply not being in the list. */
  profileError: string | null;
  /** Effective role: from the profile, the default for signed-in users without one, hse_manager in demo mode, null when signed out. */
  role: Role | null;
  listSitePeople: (siteId: string) => Promise<SitePerson[]>;
  listProfiles: () => Promise<Profile[]>;
  importProfiles: (rows: ProfileImportRow[]) => Promise<ImportResult>;
  updateProfile: (id: string, patch: Partial<Omit<Profile, "id">>) => Promise<Profile>;
  removeProfile: (id: string) => Promise<void>;
  listTasks: () => Promise<Task[]>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>;
  listTemplates: () => Promise<ChecklistTemplate[]>;
  createTemplate: (input: CreateTemplateInput) => Promise<ChecklistTemplate>;
  updateTemplate: (id: string, patch: Partial<CreateTemplateInput & { active: boolean }>) => Promise<ChecklistTemplate>;
  listAudits: () => Promise<Audit[]>;
  createAudit: (input: CreateAuditInput) => Promise<Audit>;
  updateAudit: (id: string, patch: UpdateAuditInput) => Promise<Audit>;
  listOrganizations: () => Promise<Organization[]>;
  createOrganization: (input: CreateOrganizationInput) => Promise<Organization>;
  updateOrganization: (id: string, patch: Partial<CreateOrganizationInput & { active: boolean }>) => Promise<Organization>;
  createSite: (input: CreateSiteInput) => Promise<Site>;
  updateSite: (id: string, patch: { name?: string; city?: string | null; address?: string | null; active?: boolean }) => Promise<void>;
  createLocation: (siteId: string, name: string) => Promise<SiteLocation>;
  removeLocation: (id: string) => Promise<void>;
  listRiskTypes: (organizationId?: string | null) => Promise<RiskType[]>;
  createRiskType: (organizationId: string, label: string) => Promise<RiskType>;
  removeRiskType: (id: string) => Promise<void>;
  listOrgPeople: (organizationId: string) => Promise<SitePerson[]>;
  resolveReportKey: (key: string) => Promise<ReportTarget | null>;
  listReportKeys: () => Promise<ReportKey[]>;
  rotateReportKey: (scope: { siteId?: string | null; organizationId?: string | null }) => Promise<string>;
  listSubcontractors: (organizationId?: string | null) => Promise<Subcontractor[]>;
  createSubcontractor: (organizationId: string, name: string) => Promise<Subcontractor>;
  removeSubcontractor: (id: string) => Promise<void>;
  requestMembership: (input: MembershipRequestInput) => Promise<"requested" | "already_member">;
  listMembershipRequests: () => Promise<MembershipRequest[]>;
  decideMembership: (id: string, status: "approved" | "rejected") => Promise<void>;
  createStaff: (input: CreateStaffInput) => Promise<CreateStaffResult>;
  /** Re-reads sites and areas after settings changed. */
  reloadSites: () => Promise<void>;
  updateStatus: (incidentId: string, status: IncidentStatus) => Promise<Incident>;
  saveIncidentAnalysis: (incidentId: string, analysis: IncidentAnalysis, language: string) => Promise<Incident>;
  listContacts: () => Promise<Contact[]>;
  addContact: (input: { name: string; email: string; role?: string | null }) => Promise<Contact>;
  removeContact: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  syncQueuedReports: () => Promise<void>;
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
  const { locale, t } = useLanguage();
  const { session } = useAuth();
  const [repository] = useState<IncidentRepository>(createIncidentRepository);

  const sessionResolved = session !== undefined;
  const canReadIncidents = !usingSupabase || Boolean(session);

  const [incidents, setIncidents] = useState<Incident[]>(() =>
    usingSupabase ? [] : sortIncidents(structuredClone(SEED_INCIDENTS))
  );
  const [sites, setSites] = useState<Site[]>(() => (usingSupabase ? [] : structuredClone(SITES)));
  // Metrics are derived from the list so realtime updates and refreshes stay consistent.
  const metrics = useMemo<DashboardMetrics>(
    () => (canReadIncidents ? computeMetrics(incidents) : EMPTY_METRICS),
    [canReadIncidents, incidents]
  );
  const [latestSafetyWalk, setLatestSafetyWalk] = useState<SafetyWalkSummary | null>(() =>
    usingSupabase ? null : toSafetyWalkSummary(SEED_SAFETY_WALKS[0])
  );
  const [loading, setLoading] = useState(usingSupabase);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);
  // Latest list for callbacks that compare the previous owner or severity.
  const incidentsRef = useRef<Incident[]>([]);
  useEffect(() => {
    incidentsRef.current = incidents;
  }, [incidents]);

  // The signed-in person's profile (matched by e-mail) decides their role.
  // Demo mode has no session: act as an HSE manager so every screen is reachable.
  const [profile, setProfile] = useState<Profile | null | undefined>(usingSupabase ? undefined : null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const sessionEmail = session?.user.email ?? null;
  useEffect(() => {
    if (!usingSupabase) return;
    if (!sessionEmail) {
      // Signed out: no profile. (State update happens in the promise callback below.)
      Promise.resolve().then(() => {
        setProfile(null);
        setSignedInEmail(null);
      });
      return;
    }
    let cancelled = false;
    repository
      .getProfileByEmail(sessionEmail)
      .then((found) => {
        if (cancelled) return;
        setProfile(found);
        setProfileError(null);
        setSignedInEmail(sessionEmail);
      })
      .catch((caught: { message?: string }) => {
        if (!cancelled) {
          setProfile(null);
          setProfileError(caught?.message ?? "unknown error");
          setSignedInEmail(sessionEmail);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repository, sessionEmail]);
  // Demo mode acts as the app owner so every screen is reachable.
  const role: Role | null = !usingSupabase
    ? "super_admin"
    : session
      ? profile === undefined
        ? null
        : (profile?.role ?? DEFAULT_SIGNED_IN_ROLE)
      : null;
  void signedInEmail;

  // IndexedDB unavailable (private mode) means nothing can be queued either, so errors are ignored.
  const refreshPending = useCallback(
    () => countQueuedReports().then(setPendingCount).catch(() => undefined),
    []
  );

  const refresh = useCallback(async () => {
    try {
      const nextSites = await repository.listSites();
      setSites(nextSites);

      if (canReadIncidents) {
        const [nextIncidents, nextWalk] = await Promise.all([
          repository.listIncidents(),
          repository.getLatestSafetyWalk().catch(() => null),
        ]);
        setIncidents(nextIncidents);
        setLatestSafetyWalk(nextWalk);
      } else {
        setIncidents([]);
        setLatestSafetyWalk(null);
      }
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load safety data.";
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, [canReadIncidents, repository]);

  useEffect(() => {
    if (!sessionResolved) return;
    // Loads from the repository (an external system); errors are stored for the UI.
    let cancelled = false;
    Promise.resolve()
      .then(() => (cancelled ? undefined : refresh()))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refresh, sessionResolved]);

  useEffect(() => {
    if (!canReadIncidents) return;
    const unsubscribe = repository.subscribeToIncidents?.(async (event) => {
      try {
        const incident = await repository.getIncident(event.id);
        if (!incident) {
          await refresh();
          return;
        }

        setIncidents((current) => {
          const exists = current.some((item) => item.id === incident.id);
          return exists
            ? current.map((item) => (item.id === incident.id ? incident : item))
            : [incident, ...current];
        });

        if (event.event === "INSERT") {
          setHighlightedIds((current) =>
            current.includes(incident.id) ? current : [incident.id, ...current]
          );
          playAlertChime();
          toast.message(`${typeLabel(incident.type, locale, incident.typeNote)}`, {
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
  }, [canReadIncidents, locale, refresh, repository]);

  const syncQueuedReports = useCallback(async () => {
    if (syncingRef.current || !offlineQueueSupported()) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    syncingRef.current = true;
    let sent = 0;
    let failed = false;
    try {
      const queued = await listQueuedReports();
      for (const report of queued) {
        try {
          const created = await repository.createIncident(toCreateIncidentInput(report));
          dispatchCriticalIncidentAlert(created, locale);
          await removeQueuedReport(report.id);
          sent += 1;
        } catch (caught) {
          if (isNetworkError(caught)) break; // still offline: keep the rest for later
          await markAttempt(report);
          failed = true;
        }
      }
    } finally {
      syncingRef.current = false;
      await refreshPending();
    }
    if (sent) {
      toast.success(t("offline.synced", { n: sent }));
      await refresh().catch(() => undefined);
    }
    if (failed) toast.error(t("offline.syncFailed"));
  }, [refresh, refreshPending, repository, t]);

  useEffect(() => {
    // Queue state lives in IndexedDB (an external system); sync when the radio comes back.
    const flush = () => void syncQueuedReports();
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [syncQueuedReports]);

  const createIncident = useCallback(
    async (input: CreateIncidentInput) => {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (!offline) {
        try {
          const created = await repository.createIncident(input);
          dispatchCriticalIncidentAlert(created, locale);
          await refresh().catch(() => undefined);
          return created;
        } catch (caught) {
          if (!isNetworkError(caught) || !offlineQueueSupported()) throw caught;
        }
      } else if (!offlineQueueSupported()) {
        throw new Error("No connection and this browser cannot store reports offline.");
      }

      const queued = await enqueueReport(input);
      await refreshPending();
      const site = sites.find((item) => item.id === input.siteId);
      const pendingIncident: Incident = {
        id: queued.id,
        reference: "",
        type: input.type,
        siteId: input.siteId,
        locationId: input.locationId,
        siteName: site?.name,
        locationName: site?.locations.find((item) => item.id === input.locationId)?.name,
        category: input.category,
        severity: input.severity,
        description: input.description,
        mediaUrls: input.mediaUrls,
        anonymous: input.anonymous,
        reporterName: input.anonymous ? null : input.reporterName,
        status: "open",
        createdAt: queued.queuedAt,
        capa: null,
        source: "report",
        pending: true,
      };
      return pendingIncident;
    },
    [refresh, refreshPending, repository, sites]
  );

  const createSafetyWalk = useCallback(
    async (input: CreateSafetyWalkInput) => {
      const created = await repository.createSafetyWalk(input);
      setLatestSafetyWalk(toSafetyWalkSummary(created));
      await refresh().catch(() => undefined);
      return created;
    },
    [refresh, repository]
  );

  const updateCapa = useCallback(
    async (incidentId: string, capa: UpdateCapaInput) => {
      const before = incidentsRef.current.find((item) => item.id === incidentId);
      const updated = await repository.updateCapa(incidentId, capa);
      await refresh().catch(() => undefined);

      // The severity is rated here by a manager, so the statutory alert fires here too.
      if (capa.severity === "critical" && before?.severity !== "critical") {
        dispatchCriticalIncidentAlert(updated, locale);
      }
      // A new action owner is told by e-mail.
      if (capa.assigneeId && capa.assigneeId !== (before?.capa?.assigneeId ?? "")) {
        void notifyAssignment({
          incidentId,
          assigneeId: capa.assigneeId,
          dueDate: capa.dueDate,
          note: capa.notes,
          language: locale,
        }).then((result) => {
          if (result === "sent") toast.success(t("assignment.sent"));
          else if (result === "no-email") toast.message(t("assignment.noEmail"));
          else if (result === "failed") toast.error(t("assignment.failed"));
        });
      }
      return updated;
    },
    [refresh, repository, locale, t]
  );

  const trackIncident = useCallback((code: string) => repository.trackIncident(code), [repository]);

  const updateStatus = useCallback(
    async (incidentId: string, status: IncidentStatus) => {
      // Optimistic move so the board feels instant; the refresh below reconciles.
      setIncidents((current) => current.map((item) => (item.id === incidentId ? { ...item, status } : item)));
      try {
        const updated = await repository.updateStatus(incidentId, status);
        setIncidents((current) => current.map((item) => (item.id === incidentId ? updated : item)));
        return updated;
      } catch (caught) {
        await refresh().catch(() => undefined);
        throw caught;
      }
    },
    [refresh, repository]
  );

  const saveIncidentAnalysis = useCallback(
    async (incidentId: string, analysis: IncidentAnalysis, language: string) => {
      const updated = await repository.saveIncidentAnalysis(incidentId, analysis, language);
      setIncidents((current) => current.map((item) => (item.id === incidentId ? updated : item)));
      return updated;
    },
    [repository]
  );

  // People, roles and tasks
  const listSitePeople = useCallback((siteId: string) => repository.listSitePeople(siteId), [repository]);
  const listProfiles = useCallback(() => repository.listProfiles(), [repository]);
  const importProfiles = useCallback((rows: ProfileImportRow[]) => repository.importProfiles(rows), [repository]);
  const updateProfile = useCallback(
    (id: string, patch: Partial<Omit<Profile, "id">>) => repository.updateProfile(id, patch),
    [repository]
  );
  const removeProfile = useCallback((id: string) => repository.removeProfile(id), [repository]);
  const listTasks = useCallback(() => repository.listTasks(), [repository]);
  const createTask = useCallback(
    (input: CreateTaskInput) => repository.createTask(input, profile?.id ?? null),
    [repository, profile]
  );
  const updateTask = useCallback((id: string, patch: UpdateTaskInput) => repository.updateTask(id, patch), [repository]);

  // Companies and settings
  const reloadSites = useCallback(async () => {
    setSites(await repository.listSites());
  }, [repository]);
  const listOrganizations = useCallback(() => repository.listOrganizations(), [repository]);
  const createOrganization = useCallback((input: CreateOrganizationInput) => repository.createOrganization(input), [repository]);
  const updateOrganization = useCallback(
    (id: string, patch: Partial<CreateOrganizationInput & { active: boolean }>) => repository.updateOrganization(id, patch),
    [repository]
  );
  const createSite = useCallback(
    async (input: CreateSiteInput) => {
      const created = await repository.createSite(input);
      await reloadSites().catch(() => undefined);
      return created;
    },
    [repository, reloadSites]
  );
  const updateSite = useCallback(
    async (id: string, patch: { name?: string; city?: string | null; address?: string | null; active?: boolean }) => {
      await repository.updateSite(id, patch);
      await reloadSites().catch(() => undefined);
    },
    [repository, reloadSites]
  );
  const createLocation = useCallback(
    async (siteId: string, name: string) => {
      const created = await repository.createLocation(siteId, name);
      await reloadSites().catch(() => undefined);
      return created;
    },
    [repository, reloadSites]
  );
  const removeLocation = useCallback(
    async (id: string) => {
      await repository.removeLocation(id);
      await reloadSites().catch(() => undefined);
    },
    [repository, reloadSites]
  );
  const listRiskTypes = useCallback((organizationId?: string | null) => repository.listRiskTypes(organizationId), [repository]);
  const createRiskType = useCallback((organizationId: string, label: string) => repository.createRiskType(organizationId, label), [repository]);
  const removeRiskType = useCallback((id: string) => repository.removeRiskType(id), [repository]);
  const listOrgPeople = useCallback((organizationId: string) => repository.listOrgPeople(organizationId), [repository]);
  const resolveReportKey = useCallback((key: string) => repository.resolveReportKey(key), [repository]);
  const listReportKeys = useCallback(() => repository.listReportKeys(), [repository]);
  const rotateReportKey = useCallback(
    (scope: { siteId?: string | null; organizationId?: string | null }) => repository.rotateReportKey(scope),
    [repository]
  );
  const listSubcontractors = useCallback((organizationId?: string | null) => repository.listSubcontractors(organizationId), [repository]);
  const createSubcontractor = useCallback((organizationId: string, name: string) => repository.createSubcontractor(organizationId, name), [repository]);
  const removeSubcontractor = useCallback((id: string) => repository.removeSubcontractor(id), [repository]);
  const requestMembership = useCallback((input: MembershipRequestInput) => repository.requestMembership(input), [repository]);
  const listMembershipRequests = useCallback(() => repository.listMembershipRequests(), [repository]);
  const decideMembership = useCallback(
    (id: string, status: "approved" | "rejected") => repository.decideMembership(id, status, profile?.id ?? null),
    [repository, profile]
  );
  const createStaff = useCallback((input: CreateStaffInput) => repository.createStaff(input), [repository]);

  // Checklist templates and audits
  const listTemplates = useCallback(() => repository.listTemplates(), [repository]);
  const createTemplate = useCallback(
    (input: CreateTemplateInput) => repository.createTemplate(input, profile?.id ?? null),
    [repository, profile]
  );
  const updateTemplate = useCallback(
    (id: string, patch: Partial<CreateTemplateInput & { active: boolean }>) => repository.updateTemplate(id, patch),
    [repository]
  );
  const listAudits = useCallback(() => repository.listAudits(), [repository]);
  const createAudit = useCallback(
    (input: CreateAuditInput) => repository.createAudit(input, profile?.id ?? null),
    [repository, profile]
  );
  const updateAudit = useCallback(
    async (id: string, patch: UpdateAuditInput) => {
      const updated = await repository.updateAudit(id, patch);
      // Submitting may have raised hazards; the feed should show them.
      if (patch.status === "submitted") await refresh().catch(() => undefined);
      return updated;
    },
    [repository, refresh]
  );

  const listContacts = useCallback(() => repository.listContacts(), [repository]);
  const addContact = useCallback(
    (input: { name: string; email: string; role?: string | null }) => repository.addContact(input),
    [repository]
  );
  const removeContact = useCallback((id: string) => repository.removeContact(id), [repository]);

  const value = useMemo(
    () => ({
      incidents,
      sites,
      metrics,
      latestSafetyWalk,
      loading,
      error,
      usingSupabase,
      canReadIncidents,
      highlightedIds,
      pendingCount,
      createIncident,
      updateCapa,
      createSafetyWalk,
      trackIncident,
      profile,
      profileError,
      role,
      listSitePeople,
      listProfiles,
      importProfiles,
      updateProfile,
      removeProfile,
      listTasks,
      createTask,
      updateTask,
      listTemplates,
      createTemplate,
      updateTemplate,
      listAudits,
      createAudit,
      updateAudit,
      listOrganizations,
      createOrganization,
      updateOrganization,
      createSite,
      updateSite,
      createLocation,
      removeLocation,
      listRiskTypes,
      createRiskType,
      removeRiskType,
      listOrgPeople,
      resolveReportKey,
      listReportKeys,
      rotateReportKey,
      listSubcontractors,
      createSubcontractor,
      removeSubcontractor,
      requestMembership,
      listMembershipRequests,
      decideMembership,
      createStaff,
      reloadSites,
      updateStatus,
      saveIncidentAnalysis,
      listContacts,
      addContact,
      removeContact,
      refresh,
      syncQueuedReports,
    }),
    [
      incidents,
      sites,
      metrics,
      latestSafetyWalk,
      loading,
      error,
      canReadIncidents,
      highlightedIds,
      pendingCount,
      createIncident,
      updateCapa,
      createSafetyWalk,
      trackIncident,
      profile,
      profileError,
      role,
      listSitePeople,
      listProfiles,
      importProfiles,
      updateProfile,
      removeProfile,
      listTasks,
      createTask,
      updateTask,
      listTemplates,
      createTemplate,
      updateTemplate,
      listAudits,
      createAudit,
      updateAudit,
      listOrganizations,
      createOrganization,
      updateOrganization,
      createSite,
      updateSite,
      createLocation,
      removeLocation,
      listRiskTypes,
      createRiskType,
      removeRiskType,
      listOrgPeople,
      resolveReportKey,
      listReportKeys,
      rotateReportKey,
      listSubcontractors,
      createSubcontractor,
      removeSubcontractor,
      requestMembership,
      listMembershipRequests,
      decideMembership,
      createStaff,
      reloadSites,
      updateStatus,
      saveIncidentAnalysis,
      listContacts,
      addContact,
      removeContact,
      refresh,
      syncQueuedReports,
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
