import { computeMetrics, sortIncidents } from "@/lib/data/metrics";
import type { IncidentRepository } from "@/lib/data/repository";
import { SEED_INCIDENTS } from "@/lib/data/seed-incidents";
import { SEED_SAFETY_WALKS } from "@/lib/data/seed-walks";
import { findLocation, findSite, ORGANIZATIONS, SITES } from "@/lib/data/sites";
import { toSafetyWalkSummary } from "@/lib/supabase/mappers";
import type {
  Audit,
  AuditItemResult,
  Organization,
  RiskType,
  Site,
  ChecklistTemplate,
  Contact,
  CreateIncidentInput,
  CreateSafetyWalkInput,
  Incident,
  Profile,
  SafetyWalk,
  Task,
  UpdateCapaInput,
} from "@/lib/types";

function withPlaceNames(incident: Incident): Incident {
  return {
    ...incident,
    siteName: incident.siteName ?? findSite(incident.siteId)?.name ?? incident.siteId,
    locationName:
      incident.locationName ??
      findLocation(incident.siteId, incident.locationId)?.name ??
      incident.locationId,
  };
}

function cloneIncidents(): Incident[] {
  return structuredClone(SEED_INCIDENTS);
}

export function nextReference(incidents: Pick<Incident, "reference">[], year = new Date().getFullYear()): string {
  const max = incidents.reduce((highest, incident) => {
    const match = incident.reference.match(/SS-\d{4}-(\d+)/);
    const n = match ? Number(match[1]) : 0;
    return Math.max(highest, n);
  }, 0);
  return `SS-${year}-${String(max + 1).padStart(4, "0")}`;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Same shape as the database trigger: K7FP-3M2X. */
export function generateTrackingCode(random: () => number = Math.random) {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
    if (i === 3) code += "-";
  }
  return code;
}

export function normalizeTrackingCode(code: string) {
  return code.trim().toUpperCase().replaceAll(/\s+/g, "");
}

function objectUrl(blob: Blob | null | undefined) {
  if (!blob || blob.size === 0 || typeof URL?.createObjectURL !== "function") return null;
  return URL.createObjectURL(blob);
}

/** In-memory repository used when Supabase is not configured (demo / offline dev). */
export function createMockRepository(): IncidentRepository {
  let incidents = cloneIncidents();
  const sites: Site[] = structuredClone(SITES);
  let organizations: Organization[] = structuredClone(ORGANIZATIONS);
  let riskTypes: RiskType[] = [
    { id: "rt-forklift", organizationId: "org-volvo", label: "Truck / forklift", active: true },
    { id: "rt-glass", organizationId: "org-sydkomp", label: "Glass breakage", active: true },
  ];
  const siteOf = (id: string) => sites.find((site) => site.id === id) ?? null;
  let walks: SafetyWalk[] = structuredClone(SEED_SAFETY_WALKS);
  let contacts: Contact[] = [
    { id: "contact-anna", name: "Anna Bergström", email: "anna.bergstrom@example.se", role: "HSE Manager" },
    { id: "contact-erik", name: "Erik Lindqvist", email: "erik.lindqvist@example.se", role: "Safety Officer" },
  ];
  let profiles: Profile[] = [
    { id: "p-anna", fullName: "Anna Bergström", email: "anna.bergstrom@example.se", phone: null, role: "hse_manager", organizationId: "org-nordic", siteId: null, siteName: null, employeeNo: "1001", reportsTo: null, reportsToName: null, language: "sv", active: true },
    { id: "p-erik", fullName: "Erik Lindqvist", email: "erik.lindqvist@example.se", phone: null, role: "safety_officer", organizationId: "org-nordic", siteId: "site-kvillebacken", siteName: "Kvillebäcken Construction Site", employeeNo: "1002", reportsTo: "p-anna", reportsToName: "Anna Bergström", language: "sv", active: true },
    { id: "p-johan", fullName: "Johan Ek", email: "johan.ek@example.se", phone: null, role: "foreman", organizationId: "org-nordic", siteId: "site-kvillebacken", siteName: "Kvillebäcken Construction Site", employeeNo: "2001", reportsTo: "p-erik", reportsToName: "Erik Lindqvist", language: "sv", active: true },
    { id: "p-ali", fullName: "Ali Yılmaz", email: null, phone: null, role: "worker", organizationId: "org-nordic", siteId: "site-kvillebacken", siteName: "Kvillebäcken Construction Site", employeeNo: "3001", reportsTo: "p-johan", reportsToName: "Johan Ek", language: "tr", active: true },
    { id: "p-piotr", fullName: "Piotr Nowak", email: null, phone: null, role: "worker", organizationId: "org-nordic", siteId: "site-kvillebacken", siteName: "Kvillebäcken Construction Site", employeeNo: "3002", reportsTo: "p-johan", reportsToName: "Johan Ek", language: "pl", active: true },
  ];
  let tasks: Task[] = [
    { id: "task-1", title: "Zone 3 scaffold tag renewal", description: "Arrange re-inspection and new tag before Monday.", priority: "high", status: "open", assigneeId: "p-johan", assigneeName: "Johan Ek", createdById: "p-erik", createdByName: "Erik Lindqvist", siteId: "site-kvillebacken", incidentId: null, incidentReference: null, dueDate: "2026-10-20", feedback: "", completedAt: null, createdAt: "2026-10-15T08:00:00.000Z", updatedAt: null },
  ];
  const profileName = (id: string | null) => profiles.find((p) => p.id === id)?.fullName ?? null;
  let templates: ChecklistTemplate[] = [
    {
      id: "tpl-gas",
      name: "Gas cylinder check",
      description: "Weekly check of stored and in-use gas cylinders.",
      items: [
        { key: "secured", title: "Cylinders secured upright with chain or strap" },
        { key: "caps", title: "Valve caps fitted on cylinders not in use" },
        { key: "hoses", title: "Hoses and regulators free of damage" },
        { key: "flashback", title: "Flashback arrestors fitted" },
        { key: "signage", title: "Storage area signed and ventilated" },
      ],
      active: true,
      createdById: "p-erik",
      createdAt: "2026-10-10T08:00:00.000Z",
    },
  ];
  let audits: Audit[] = [];

  return {
    async listSites() {
      return structuredClone(sites);
    },

    async listIncidents() {
      return sortIncidents(structuredClone(incidents)).map(withPlaceNames);
    },

    async getIncident(id) {
      const found = incidents.find((incident) => incident.id === id);
      return found ? withPlaceNames(structuredClone(found)) : null;
    },

    async createIncident(input: CreateIncidentInput) {
      const locationIds = input.locationIds ?? (input.locationId ? [input.locationId] : []);
      const categories = (input.categories ?? (input.category === "unclassified" ? [] : [input.category])).filter(
        (category) => category !== "unclassified"
      );
      const site = input.siteId ? siteOf(input.siteId) : null;
      const locationNames = locationIds
        .map((id) => site?.locations.find((location) => location.id === id)?.name ?? findLocation(input.siteId, id)?.name)
        .filter(Boolean) as string[];
      const created: Incident = {
        id: `inc-${crypto.randomUUID().slice(0, 8)}`,
        reference: nextReference(incidents),
        type: input.type,
        siteId: input.siteId,
        locationId: locationIds[0] ?? "",
        locationIds,
        siteName: site?.name,
        locationName: locationNames.length ? locationNames.join(", ") : site?.name,
        organizationId: site?.organizationId ?? input.organizationId ?? null,
        locationNote: input.locationNote?.trim() || null,
        typeNote: input.typeNote?.trim() || null,
        category: categories[0] ?? "unclassified",
        categories,
        severity: input.severity,
        description: input.description,
        mediaUrls: input.mediaUrls,
        audioUrl: objectUrl(input.audioFile),
        originalLanguage: input.originalLanguage ?? null,
        originalText: input.originalText ?? null,
        summarySv: input.summarySv ?? null,
        trackingCode: generateTrackingCode(),
        publicNote: null,
        reporterProfileId: input.anonymous ? null : (input.reporterProfileId ?? null),
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        anonymous: input.anonymous,
        reporterName: input.anonymous ? null : (profileName(input.reporterProfileId ?? null) ?? input.reporterName),
        status: "open",
        createdAt: new Date().toISOString(),
        capa: null,
        source: "report",
      };
      incidents = [created, ...incidents];
      return withPlaceNames(structuredClone(created));
    },

    async updateCapa(incidentId, capa: UpdateCapaInput) {
      const index = incidents.findIndex((incident) => incident.id === incidentId);
      if (index === -1) {
        throw new Error(`Incident ${incidentId} not found`);
      }

      const { severity, publicNote, categories, ...capaFields } = capa;
      const cleanCategories = categories?.filter((category) => category !== "unclassified");
      const updated: Incident = {
        ...incidents[index],
        status: capa.status,
        severity: severity ?? incidents[index].severity,
        ...(cleanCategories ? { categories: cleanCategories, category: cleanCategories[0] ?? "unclassified" } : {}),
        publicNote: publicNote !== undefined ? publicNote.trim() || null : incidents[index].publicNote,
        capa: {
          ...capaFields,
          updatedAt: new Date().toISOString(),
        },
      };
      incidents[index] = updated;
      return withPlaceNames(structuredClone(updated));
    },

    async getMetrics() {
      return computeMetrics(incidents);
    },

    async updateStatus(incidentId, status) {
      const index = incidents.findIndex((incident) => incident.id === incidentId);
      if (index === -1) throw new Error(`Incident ${incidentId} not found`);
      const current = incidents[index];
      const updated: Incident = {
        ...current,
        status,
        capa: current.capa ? { ...current.capa, status, updatedAt: new Date().toISOString() } : null,
      };
      incidents[index] = updated;
      return withPlaceNames(structuredClone(updated));
    },

    async saveIncidentAnalysis(incidentId, analysis, language) {
      const index = incidents.findIndex((incident) => incident.id === incidentId);
      if (index === -1) throw new Error(`Incident ${incidentId} not found`);
      const updated: Incident = {
        ...incidents[index],
        aiAnalysis: analysis,
        aiAnalysisLanguage: language,
        aiAnalyzedAt: new Date().toISOString(),
      };
      incidents[index] = updated;
      return withPlaceNames(structuredClone(updated));
    },

    async listContacts() {
      return structuredClone(contacts);
    },

    async addContact(input) {
      const contact: Contact = {
        id: `contact-${crypto.randomUUID().slice(0, 8)}`,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role?.trim() || null,
      };
      contacts = [...contacts, contact].sort((a, b) => a.name.localeCompare(b.name));
      return structuredClone(contact);
    },

    async removeContact(id) {
      contacts = contacts.filter((contact) => contact.id !== id);
    },

    async listSitePeople(siteId) {
      return profiles
        .filter((p) => p.active && (p.siteId === siteId || p.siteId === null))
        .map((p) => ({ id: p.id, fullName: p.fullName, role: p.role, employeeNo: p.employeeNo }));
    },

    async listProfiles() {
      return structuredClone(profiles);
    },

    async getProfileByEmail(email) {
      const found = profiles.find((p) => p.email?.toLowerCase() === email.trim().toLowerCase());
      return found ? structuredClone(found) : null;
    },

    async importProfiles(rows) {
      const result = { created: 0, updated: 0, skipped: [] as { row: number; reason: string }[] };
      const sites = SITES;
      for (const [index, row] of rows.entries()) {
        const name = row.fullName?.trim();
        if (!name) {
          result.skipped.push({ row: index + 1, reason: "missing name" });
          continue;
        }
        const email = row.email?.trim().toLowerCase() || null;
        const site = row.siteName ? sites.find((s) => s.name.toLowerCase() === row.siteName!.trim().toLowerCase()) : undefined;
        const existing = profiles.find((p) => (email && p.email?.toLowerCase() === email) || (row.employeeNo && p.employeeNo === row.employeeNo) || p.fullName.toLowerCase() === name.toLowerCase());
        const manager = profiles.find((p) => (row.reportsToEmail && p.email?.toLowerCase() === row.reportsToEmail.toLowerCase()) || (row.reportsToName && p.fullName.toLowerCase() === row.reportsToName.toLowerCase()));
        const next: Profile = {
          id: existing?.id ?? `p-${crypto.randomUUID().slice(0, 8)}`,
          fullName: name,
          email,
          phone: row.phone?.trim() || null,
          role: row.role ?? existing?.role ?? "worker",
          siteId: site?.id ?? existing?.siteId ?? null,
          siteName: site?.name ?? existing?.siteName ?? null,
          employeeNo: row.employeeNo?.trim() || existing?.employeeNo || null,
          reportsTo: manager?.id ?? existing?.reportsTo ?? null,
          reportsToName: manager?.fullName ?? existing?.reportsToName ?? null,
          language: row.language?.trim().toLowerCase() || existing?.language || null,
          active: true,
        };
        if (existing) {
          profiles = profiles.map((p) => (p.id === existing.id ? next : p));
          result.updated += 1;
        } else {
          profiles = [...profiles, next];
          result.created += 1;
        }
      }
      profiles.sort((a, b) => a.fullName.localeCompare(b.fullName));
      return result;
    },

    async updateProfile(id, patch) {
      const index = profiles.findIndex((p) => p.id === id);
      if (index === -1) throw new Error(`Profile ${id} not found`);
      const updated: Profile = { ...profiles[index], ...patch, id };
      updated.siteName = SITES.find((s) => s.id === updated.siteId)?.name ?? null;
      updated.reportsToName = profileName(updated.reportsTo);
      profiles[index] = updated;
      return structuredClone(updated);
    },

    async removeProfile(id) {
      profiles = profiles.filter((p) => p.id !== id);
    },

    async listTasks() {
      return structuredClone(tasks);
    },

    async createTask(input, createdById) {
      const task: Task = {
        id: `task-${crypto.randomUUID().slice(0, 8)}`,
        title: input.title.trim(),
        description: input.description.trim(),
        priority: input.priority,
        status: "open",
        assigneeId: input.assigneeId,
        assigneeName: profileName(input.assigneeId),
        createdById,
        createdByName: profileName(createdById),
        siteId: input.siteId,
        incidentId: input.incidentId,
        incidentReference: incidents.find((i) => i.id === input.incidentId)?.reference ?? null,
        dueDate: input.dueDate,
        feedback: "",
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      tasks = [task, ...tasks];
      return structuredClone(task);
    },

    async updateTask(id, patch) {
      const index = tasks.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Task ${id} not found`);
      const current = tasks[index];
      const updated: Task = {
        ...current,
        status: patch.status ?? current.status,
        feedback: patch.feedback !== undefined ? patch.feedback.trim() : current.feedback,
        assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : current.assigneeId,
        assigneeName: patch.assigneeId !== undefined ? profileName(patch.assigneeId) : current.assigneeName,
        dueDate: patch.dueDate !== undefined ? patch.dueDate : current.dueDate,
        priority: patch.priority ?? current.priority,
        completedAt: (patch.status ?? current.status) === "done" ? (current.completedAt ?? new Date().toISOString()) : null,
        updatedAt: new Date().toISOString(),
      };
      tasks[index] = updated;
      return structuredClone(updated);
    },

    async listTemplates() {
      return structuredClone(templates);
    },

    async createTemplate(input, createdById) {
      const template: ChecklistTemplate = {
        id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
        name: input.name.trim(),
        description: input.description.trim(),
        items: input.items,
        active: true,
        createdById,
        createdAt: new Date().toISOString(),
      };
      templates = [...templates, template];
      return structuredClone(template);
    },

    async updateTemplate(id, patch) {
      const index = templates.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Template ${id} not found`);
      const updated: ChecklistTemplate = {
        ...templates[index],
        name: patch.name !== undefined ? patch.name.trim() : templates[index].name,
        description: patch.description !== undefined ? patch.description.trim() : templates[index].description,
        items: patch.items ?? templates[index].items,
        active: patch.active ?? templates[index].active,
      };
      templates[index] = updated;
      return structuredClone(updated);
    },

    async listAudits() {
      return structuredClone(
        audits.map((audit) => ({
          ...audit,
          items: audit.items.map((item) => ({
            ...item,
            incidentStatus: item.incidentId ? (incidents.find((i) => i.id === item.incidentId)?.status ?? null) : null,
          })),
          openNonConformities: incidents.filter((i) => i.auditId === audit.id && i.status !== "resolved").length,
        }))
      );
    },

    async createAudit(input, createdById) {
      const template = templates.find((t) => t.id === input.templateId);
      if (!template) throw new Error("Template not found");
      const audit: Audit = {
        id: `audit-${crypto.randomUUID().slice(0, 8)}`,
        templateId: template.id,
        templateName: template.name,
        siteId: input.siteId,
        siteName: input.siteId ? (findSite(input.siteId)?.name ?? null) : null,
        assigneeId: input.assigneeId,
        assigneeName: profileName(input.assigneeId),
        createdById,
        createdByName: profileName(createdById),
        dueDate: input.dueDate,
        status: "assigned",
        items: template.items.map((item) => ({ key: item.key, title: item.title, status: null, note: "", dueDate: null, assigneeId: null, incidentId: null })),
        note: "",
        submittedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        openNonConformities: 0,
      };
      audits = [audit, ...audits];
      return structuredClone(audit);
    },

    async updateAudit(id, patch) {
      const index = audits.findIndex((a) => a.id === id);
      if (index === -1) throw new Error(`Audit ${id} not found`);
      const current = audits[index];
      let items: AuditItemResult[] = patch.items ?? current.items;
      if (patch.status === "submitted") {
        if (!current.siteId) throw new Error("The audit needs a site before failed items can become hazards.");
        items = items.map((item) => {
          if (item.status !== "fail" || item.incidentId) return item;
          const hazard: Incident = {
            id: `inc-${crypto.randomUUID().slice(0, 8)}`,
            reference: nextReference(incidents),
            type: "hazard",
            siteId: current.siteId!,
            locationId: "",
            locationIds: [],
            category: "unclassified",
            categories: [],
            severity: "medium",
            description: [item.title, item.note.trim()].filter(Boolean).join(" — "),
            mediaUrls: [],
            anonymous: false,
            reporterName: current.assigneeName ?? current.createdByName ?? null,
            reporterProfileId: current.assigneeId,
            status: "open",
            createdAt: new Date().toISOString(),
            capa:
              item.dueDate || item.assigneeId
                ? { assigneeId: item.assigneeId ?? "", assigneeName: profileName(item.assigneeId) ?? "", dueDate: item.dueDate ?? "", status: "open", notes: `${current.templateName}: ${item.title}`, updatedAt: new Date().toISOString() }
                : null,
            source: "audit",
            auditId: current.id,
          };
          incidents = [hazard, ...incidents];
          return { ...item, assigneeName: profileName(item.assigneeId), incidentId: hazard.id, incidentReference: hazard.reference, incidentStatus: "open" as const };
        });
      }
      const openCount = incidents.filter((i) => i.auditId === id && i.status !== "resolved").length;
      if (patch.status === "done" && openCount > 0) throw new Error("AUDIT_OPEN_NONCONFORMITIES");
      const status = patch.status ?? current.status;
      const updated: Audit = {
        ...current,
        items,
        status,
        note: patch.note !== undefined ? patch.note.trim() : current.note,
        assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : current.assigneeId,
        assigneeName: patch.assigneeId !== undefined ? profileName(patch.assigneeId) : current.assigneeName,
        dueDate: patch.dueDate !== undefined ? patch.dueDate : current.dueDate,
        submittedAt: status === "submitted" || status === "done" ? (current.submittedAt ?? new Date().toISOString()) : current.submittedAt,
        completedAt: status === "done" ? (current.completedAt ?? new Date().toISOString()) : null,
        openNonConformities: openCount,
      };
      audits[index] = updated;
      return structuredClone(updated);
    },

    async listOrganizations() {
      return structuredClone(organizations);
    },

    async createOrganization(input) {
      const organization: Organization = {
        id: `org-${crypto.randomUUID().slice(0, 8)}`,
        name: input.name.trim(),
        organizationNumber: input.organizationNumber?.trim() || null,
        address: input.address?.trim() || null,
        industry: input.industry?.trim() || null,
        active: true,
      };
      organizations = [...organizations, organization];
      return structuredClone(organization);
    },

    async updateOrganization(id, patch) {
      const index = organizations.findIndex((item) => item.id === id);
      if (index === -1) throw new Error(`Company ${id} not found`);
      organizations[index] = {
        ...organizations[index],
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.organizationNumber !== undefined ? { organizationNumber: patch.organizationNumber ?? null } : {}),
        ...(patch.address !== undefined ? { address: patch.address ?? null } : {}),
        ...(patch.industry !== undefined ? { industry: patch.industry ?? null } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      };
      return structuredClone(organizations[index]);
    },

    async createSite(input) {
      const organization = organizations.find((item) => item.id === input.organizationId);
      const site: Site = {
        id: `site-${crypto.randomUUID().slice(0, 8)}`,
        name: input.name.trim(),
        city: input.city?.trim() || "",
        address: input.address?.trim() || undefined,
        organizationId: input.organizationId,
        organizationName: organization?.name,
        active: true,
        locations: [],
      };
      sites.push(site);
      return structuredClone(site);
    },

    async updateSite(id, patch) {
      const site = siteOf(id);
      if (!site) throw new Error(`Site ${id} not found`);
      if (patch.name !== undefined) site.name = patch.name.trim();
      if (patch.city !== undefined) site.city = patch.city?.trim() || "";
      if (patch.address !== undefined) site.address = patch.address?.trim() || undefined;
      if (patch.active !== undefined) site.active = patch.active;
    },

    async createLocation(siteId, name) {
      const site = siteOf(siteId);
      if (!site) throw new Error(`Site ${siteId} not found`);
      const location = { id: `loc-${crypto.randomUUID().slice(0, 8)}`, name: name.trim(), latitude: null, longitude: null };
      site.locations.push(location);
      return structuredClone(location);
    },

    async removeLocation(id) {
      for (const site of sites) site.locations = site.locations.filter((location) => location.id !== id);
    },

    async listRiskTypes(organizationId) {
      return structuredClone(riskTypes.filter((item) => item.active && (!organizationId || item.organizationId === organizationId)));
    },

    async createRiskType(organizationId, label) {
      const clean = label.trim().slice(0, 80);
      if (riskTypes.some((item) => item.organizationId === organizationId && item.label.toLowerCase() === clean.toLowerCase())) {
        throw new Error("This risk type already exists.");
      }
      const riskType: RiskType = { id: `rt-${crypto.randomUUID().slice(0, 8)}`, organizationId, label: clean, active: true };
      riskTypes = [...riskTypes, riskType];
      return structuredClone(riskType);
    },

    async removeRiskType(id) {
      riskTypes = riskTypes.filter((item) => item.id !== id);
    },

    async listOrgPeople(organizationId) {
      return profiles
        .filter((person) => person.active && person.role !== "super_admin" && person.organizationId === organizationId)
        .map((person) => ({ id: person.id, fullName: person.fullName, role: person.role, employeeNo: person.employeeNo }));
    },

    async createStaff(input) {
      const email = input.email?.trim() || null;
      if (email && profiles.some((person) => person.email?.toLowerCase() === email.toLowerCase())) {
        throw new Error("Someone with this e-mail is already in the list.");
      }
      const site = input.siteId ? siteOf(input.siteId) : null;
      const profile: Profile = {
        id: `p-${crypto.randomUUID().slice(0, 8)}`,
        fullName: input.fullName.trim(),
        email,
        phone: input.phone?.trim() || null,
        role: input.role,
        organizationId: input.organizationId ?? site?.organizationId ?? null,
        siteId: input.siteId ?? null,
        siteName: site?.name ?? null,
        employeeNo: input.employeeNo?.trim() || null,
        reportsTo: null,
        reportsToName: null,
        language: null,
        active: true,
      };
      profiles = [...profiles, profile];
      return { profile: structuredClone(profile), login: email && input.password ? "created" : "none" };
    },

    async trackIncident(code) {
      const wanted = normalizeTrackingCode(code);
      const found = incidents.find((incident) => incident.trackingCode === wanted);
      if (!found) return null;
      return {
        reference: found.reference,
        status: found.status,
        severity: found.severity,
        createdAt: found.createdAt,
        updatedAt: found.capa?.updatedAt ?? null,
        hasOwner: Boolean(found.capa?.assigneeName),
        dueDate: found.capa?.dueDate ?? null,
        publicNote: found.publicNote ?? null,
      };
    },

    async getLatestSafetyWalk() {
      const latest = [...walks].sort((a, b) => +new Date(b.completedAt) - +new Date(a.completedAt))[0];
      return latest ? toSafetyWalkSummary(latest) : null;
    },

    async createSafetyWalk(input: CreateSafetyWalkInput) {
      const site = findSite(input.siteId);
      const walkId = `walk-${crypto.randomUUID().slice(0, 8)}`;
      const created: SafetyWalk = {
        id: walkId,
        title: input.title,
        siteId: input.siteId,
        siteName: site?.name,
        skyddsombudName: input.skyddsombudName,
        skyddsombudRole: input.skyddsombudRole,
        completedAt: new Date().toISOString(),
        items: input.items.map((item, index) => ({
          id: `${walkId}-${item.itemKey}`,
          walkId,
          itemKey: item.itemKey,
          domain: item.domain,
          title: item.title,
          status: item.status,
          notes: item.notes,
          photoUrl: objectUrl(item.photoFile),
          sortOrder: item.sortOrder ?? index,
          actionStatus: item.status === "deviation" ? "pending" : null,
        })),
      };
      walks = [created, ...walks];
      return structuredClone(created);
    },
  };
}
