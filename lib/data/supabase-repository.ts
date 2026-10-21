import { computeMetrics } from "@/lib/data/metrics";
import type { ImportResult, IncidentRepository, RealtimeIncidentHandler } from "@/lib/data/repository";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { audioExtension, sanitizeFileName } from "@/lib/media";
import { addBusinessDaysIsoDate } from "@/lib/skyddsrond/business-days";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  incidentMediaPaths,
  isSkyddsrondIncident,
  mapAudit,
  mapContact,
  mapIncident,
  mapMembershipRequest,
  mapOrganization,
  mapSubcontractor,
  mapProfile,
  mapRiskType,
  mapRole,
  mapSafetyWalk,
  mapSite,
  mapTask,
  mapTemplate,
  mapTracked,
  toSafetyWalkSummary,
  walkMediaPaths,
  type AuditQueryRow,
  type IncidentQueryRow,
  type MediaUrlResolver,
  type ProfileQueryRow,
  type SafetyWalkQueryRow,
  type SiteQueryRow,
  type TaskQueryRow,
} from "@/lib/supabase/mappers";
import type {
  Audit,
  AuditItemResult,
  CreateOrganizationInput,
  MembershipRequest,
  MembershipRequestInput,
  Subcontractor,
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
  CreateSafetyWalkInput,
  CreateTaskInput,
  CreateTemplateInput,
  Incident,
  IncidentAnalysis,
  IncidentStatus,
  Profile,
  ProfileImportRow,
  Role,
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
import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_BUCKET = "incident-media";

/** Signed URLs live this long; they are re-signed on every read so they never go stale in the UI. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 4;

const SITE_SELECT =
  "*, organizations ( id, name, organization_number, address ), site_locations ( id, name, sort_order, latitude, longitude )";

const INCIDENT_SELECT = `
  *,
  sites ( id, name, city ),
  site_locations ( id, name ),
  actions ( * ),
  incident_attachments ( * )
`;

const WALK_SELECT = "*, sites ( id, name ), safety_walk_items ( * )";

const PROFILE_SELECT = "*, sites ( id, name ), manager:profiles!profiles_reports_to_fkey ( id, full_name )";

const TASK_SELECT =
  "*, assignee:profiles!tasks_assignee_id_fkey ( id, full_name ), creator:profiles!tasks_created_by_fkey ( id, full_name ), incidents ( id, reference )";

const AUDIT_SELECT =
  "*, sites ( id, name ), assignee:profiles!audits_assignee_id_fkey ( id, full_name ), creator:profiles!audits_created_by_fkey ( id, full_name ), incidents ( id, reference, status )";

type Client = SupabaseClient<Database>;

/**
 * Talks to the schema in supabase/migrations. Field reports go through the
 * `submit_incident` RPC so anonymous workers never need read access to incidents.
 */
export class SupabaseIncidentRepository implements IncidentRepository {
  constructor(private readonly client: Client) {}

  async listSites(): Promise<Site[]> {
    const result = await this.client.from("sites").select(SITE_SELECT).order("name");
    if (result.error) throw result.error;
    return (result.data as unknown as SiteQueryRow[]).map(mapSite);
  }

  async listIncidents(): Promise<Incident[]> {
    const result = await this.client
      .from("incidents")
      .select(INCIDENT_SELECT)
      .order("created_at", { ascending: false });
    if (result.error) throw result.error;

    const rows = (result.data ?? []) as unknown as IncidentQueryRow[];
    const mediaUrl = await this.signMedia(rows.flatMap(incidentMediaPaths));
    return rows.map((row) => mapIncident(row, mediaUrl)).filter((incident) => !isSkyddsrondIncident(incident));
  }

  async getIncident(id: string): Promise<Incident | null> {
    const result = await this.client.from("incidents").select(INCIDENT_SELECT).eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return null;

    const row = result.data as unknown as IncidentQueryRow;
    const mediaUrl = await this.signMedia(incidentMediaPaths(row));
    return mapIncident(row, mediaUrl);
  }

  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const id = crypto.randomUUID();
    const attachments = await this.uploadIncidentMedia(id, input);
    const locationIds = (input.locationIds ?? (input.locationId ? [input.locationId] : [])).filter(
      (locationId) => locationId && locationId !== input.siteId
    );
    const categories = (input.categories ?? (input.category === "unclassified" ? [] : [input.category])).filter(
      (category) => category !== "unclassified"
    );

    const rpc = await this.client.rpc("submit_incident", {
      p_id: id,
      p_site_id: input.siteId || null,
      p_organization_id: input.organizationId ?? null,
      p_location_note: input.locationNote ?? null,
      p_type_note: input.typeNote ?? null,
      p_hurt: input.hurt ?? null,
      p_danger_present: input.dangerPresent ?? null,
      p_subcontractor: input.subcontractor ?? null,
      p_report_key: input.reportKey ?? null,
      p_device: input.device ?? null,
      p_location_id: locationIds[0] ?? null,
      p_location_ids: locationIds,
      p_type: input.type,
      p_category: categories[0] ?? "unclassified",
      p_categories: categories,
      p_severity: input.severity,
      p_description: input.description,
      p_is_anonymous: input.anonymous,
      p_reporter_name: input.reporterName,
      p_attachments: attachments,
      p_original_language: input.originalLanguage ?? null,
      p_original_text: input.originalText ?? null,
      p_summary_sv: input.summarySv ?? null,
      p_ai_confidence: input.aiConfidence ?? null,
      p_reporter_profile_id: input.anonymous ? null : (input.reporterProfileId ?? null),
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
    });
    if (rpc.error) throw rpc.error;

    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (!row) throw new Error("The report was not accepted by the server.");

    // Anonymous reporters cannot read incidents back (RLS), so the created
    // incident is assembled locally; the dashboard reloads it with full data.
    const sites = await this.listSites();
    const site = sites.find((item) => item.id === input.siteId);
    const locationNames = locationIds
      .map((locationId) => site?.locations.find((item) => item.id === locationId)?.name)
      .filter((name): name is string => Boolean(name));
    return {
      id: row.id,
      reference: row.reference,
      type: input.type,
      siteId: input.siteId,
      locationId: locationIds[0] ?? "",
      locationIds,
      siteName: site?.name,
      locationName: locationNames.length ? locationNames.join(", ") : site?.name,
      category: categories[0] ?? "unclassified",
      categories,
      organizationId: input.organizationId ?? site?.organizationId ?? null,
      locationNote: input.locationNote ?? null,
      typeNote: input.typeNote ?? null,
      hurt: input.hurt ?? null,
      dangerPresent: input.dangerPresent ?? null,
      subcontractor: input.subcontractor ?? null,
      severity: input.severity,
      description: input.description,
      mediaUrls: input.mediaUrls,
      audioUrl: null,
      originalLanguage: input.originalLanguage ?? null,
      originalText: input.originalText ?? null,
      summarySv: input.summarySv ?? null,
      trackingCode: row.tracking_code ?? null,
      anonymous: input.anonymous,
      reporterName: input.anonymous ? null : input.reporterName,
      status: "open",
      createdAt: row.created_at,
      capa: null,
      source: "report",
    };
  }

  async updateCapa(incidentId: string, capa: UpdateCapaInput): Promise<Incident> {
    const statusUpdate = await this.client
      .from("incidents")
      .update({
        status: capa.status,
        ...(capa.severity ? { severity: capa.severity } : {}),
        ...(capa.categories
          ? {
              categories: capa.categories.filter((category) => category !== "unclassified"),
              category: capa.categories.find((category) => category !== "unclassified") ?? "unclassified",
            }
          : {}),
        ...(capa.publicNote !== undefined ? { public_note: capa.publicNote.trim() || null } : {}),
      })
      .eq("id", incidentId);
    if (statusUpdate.error) throw statusUpdate.error;

    const existing = await this.client
      .from("actions")
      .select("id")
      .eq("incident_id", incidentId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const actionPayload = {
      incident_id: incidentId,
      assignee_id: capa.assigneeId || null,
      assignee_name: capa.assigneeName,
      due_date: capa.dueDate || null,
      status: capa.status,
      notes: capa.notes,
    };

    const saved = existing.data?.id
      ? await this.client.from("actions").update(actionPayload).eq("id", existing.data.id)
      : await this.client.from("actions").insert(actionPayload);
    if (saved.error) throw saved.error;

    const incident = await this.getIncident(incidentId);
    if (!incident) throw new Error("CAPA was saved but the incident could not be reloaded.");
    return incident;
  }

  async getMetrics() {
    return computeMetrics(await this.listIncidents());
  }

  async getLatestSafetyWalk(): Promise<SafetyWalkSummary | null> {
    const result = await this.client
      .from("safety_walks")
      .select(WALK_SELECT)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return null;
    return toSafetyWalkSummary(await this.hydrateWalk(result.data as unknown as SafetyWalkQueryRow));
  }

  async createSafetyWalk(input: CreateSafetyWalkInput): Promise<SafetyWalk> {
    const sites = await this.listSites();
    const site = sites.find((item) => item.id === input.siteId);
    const dueDate = addBusinessDaysIsoDate(new Date(), 3);

    const walk = await this.client
      .from("safety_walks")
      .insert({
        site_id: input.siteId,
        organization_id: site?.organizationId ?? null,
        title: input.title,
        skyddsombud_name: input.skyddsombudName,
        skyddsombud_role: input.skyddsombudRole,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (walk.error) throw walk.error;
    const walkId = walk.data.id;

    const itemRows = [];
    for (const [index, item] of input.items.entries()) {
      const photoPath = await this.uploadWalkPhoto(walkId, item.itemKey, item.photoFile);
      itemRows.push({
        safety_walk_id: walkId,
        domain: item.domain,
        item_key: item.itemKey,
        title: item.title,
        status: item.status,
        notes: item.notes.trim() || null,
        photo_path: photoPath,
        sort_order: item.sortOrder ?? index,
      });
    }

    const items = await this.client.from("safety_walk_items").insert(itemRows).select("id, title, status, notes");
    if (items.error) throw items.error;

    const deviations = items.data.filter((item) => item.status === "deviation");
    if (deviations.length) {
      const actionRows = deviations.map((item) => ({
        safety_walk_id: walkId,
        safety_walk_item_id: item.id,
        title: `[Skyddsrond] ${item.title}`,
        description: item.notes?.trim() || "Deviation recorded during skyddsrond.",
        notes: item.notes?.trim() || null,
        status: "pending",
        due_date: dueDate,
        assignee_name: input.skyddsombudName,
      }));
      const actions = await this.client.from("actions").insert(actionRows);
      if (actions.error) throw actions.error;
    }

    const created = await this.client.from("safety_walks").select(WALK_SELECT).eq("id", walkId).maybeSingle();
    if (created.error) throw created.error;
    if (!created.data) throw new Error("Skyddsrond was saved but could not be reloaded.");
    return this.hydrateWalk(created.data as unknown as SafetyWalkQueryRow);
  }

  async updateStatus(incidentId: string, status: IncidentStatus): Promise<Incident> {
    const update = await this.client.from("incidents").update({ status }).eq("id", incidentId);
    if (update.error) throw update.error;
    // Keep the latest CAPA row in step so the detail dialog and /track agree.
    const latest = await this.client
      .from("actions")
      .select("id")
      .eq("incident_id", incidentId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!latest.error && latest.data?.id) {
      await this.client.from("actions").update({ status }).eq("id", latest.data.id);
    }
    const incident = await this.getIncident(incidentId);
    if (!incident) throw new Error("Status was saved but the incident could not be reloaded.");
    return incident;
  }

  async saveIncidentAnalysis(incidentId: string, analysis: IncidentAnalysis, language: string): Promise<Incident> {
    const update = await this.client
      .from("incidents")
      .update({
        ai_analysis: analysis as unknown as Json,
        ai_analysis_language: language,
        ai_analyzed_at: new Date().toISOString(),
      })
      .eq("id", incidentId);
    if (update.error) throw update.error;
    const incident = await this.getIncident(incidentId);
    if (!incident) throw new Error("Analysis was saved but the incident could not be reloaded.");
    return incident;
  }

  async listContacts(): Promise<Contact[]> {
    const result = await this.client.from("contacts").select("id, name, email, role").order("name");
    if (result.error) throw result.error;
    return (result.data ?? []).map(mapContact);
  }

  async addContact(input: { name: string; email: string; role?: string | null }): Promise<Contact> {
    const result = await this.client
      .from("contacts")
      .insert({ name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role?.trim() || null })
      .select("id, name, email, role")
      .single();
    if (result.error) throw result.error;
    return mapContact(result.data);
  }

  async removeContact(id: string): Promise<void> {
    const result = await this.client.from("contacts").delete().eq("id", id);
    if (result.error) throw result.error;
  }

  // --- People -------------------------------------------------------------

  async listSitePeople(siteId: string): Promise<SitePerson[]> {
    const result = await this.client.rpc("list_site_people", { p_site_id: siteId });
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      role: mapRole(row.role),
      employeeNo: row.employee_no,
    }));
  }

  async listProfiles(): Promise<Profile[]> {
    const result = await this.client.from("profiles").select(PROFILE_SELECT).order("full_name");
    if (result.error) throw result.error;
    return ((result.data ?? []) as unknown as ProfileQueryRow[]).map(mapProfile);
  }

  async getProfileByEmail(email: string): Promise<Profile | null> {
    const result = await this.client.from("profiles").select(PROFILE_SELECT).ilike("email", email.trim()).limit(1).maybeSingle();
    if (result.error) throw result.error;
    return result.data ? mapProfile(result.data as unknown as ProfileQueryRow) : null;
  }

  async importProfiles(rows: ProfileImportRow[]): Promise<ImportResult> {
    const sites = await this.listSites();
    const existing = await this.listProfiles();
    const byEmail = new Map(existing.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]));
    const byEmployeeNo = new Map(existing.filter((p) => p.employeeNo).map((p) => [p.employeeNo!, p]));
    const byName = new Map(existing.map((p) => [p.fullName.toLowerCase(), p]));
    const result: ImportResult = { created: 0, updated: 0, skipped: [] };

    // First pass: people. Second pass: who reports to whom (managers may appear later in the file).
    const savedIds = new Map<number, string>();
    for (const [index, row] of rows.entries()) {
      const name = row.fullName?.trim();
      if (!name) {
        result.skipped.push({ row: index + 1, reason: "missing name" });
        continue;
      }
      const email = row.email?.trim().toLowerCase() || null;
      const site = row.siteName ? sites.find((s) => s.name.toLowerCase() === row.siteName!.trim().toLowerCase()) : undefined;
      if (row.siteName && !site) {
        result.skipped.push({ row: index + 1, reason: `unknown site "${row.siteName}"` });
        continue;
      }
      const match =
        (email && byEmail.get(email)) || (row.employeeNo && byEmployeeNo.get(row.employeeNo)) || byName.get(name.toLowerCase());
      const payload = {
        full_name: name,
        email,
        phone: row.phone?.trim() || null,
        role: row.role ?? (match?.role as Role | undefined) ?? "worker",
        site_id: site?.id ?? match?.siteId ?? null,
        organization_id: site?.organizationId ?? null,
        employee_no: row.employeeNo?.trim() || match?.employeeNo || null,
        language: row.language?.trim().toLowerCase() || match?.language || null,
        active: true,
      };
      const saved = match
        ? await this.client.from("profiles").update(payload).eq("id", match.id).select("id").single()
        : await this.client.from("profiles").insert(payload).select("id").single();
      if (saved.error) {
        result.skipped.push({ row: index + 1, reason: saved.error.message });
        continue;
      }
      savedIds.set(index, saved.data.id);
      if (match) result.updated += 1;
      else result.created += 1;
      const profile: Profile = { ...(match ?? { id: saved.data.id, fullName: name, email, phone: null, role: payload.role, siteId: payload.site_id, employeeNo: payload.employee_no, reportsTo: null, language: null, active: true }), id: saved.data.id, fullName: name, email, employeeNo: payload.employee_no };
      if (email) byEmail.set(email, profile);
      if (payload.employee_no) byEmployeeNo.set(payload.employee_no, profile);
      byName.set(name.toLowerCase(), profile);
    }

    for (const [index, row] of rows.entries()) {
      const id = savedIds.get(index);
      if (!id) continue;
      const managerEmail = row.reportsToEmail?.trim().toLowerCase();
      const managerName = row.reportsToName?.trim().toLowerCase();
      const manager = (managerEmail && byEmail.get(managerEmail)) || (managerName && byName.get(managerName)) || null;
      if (!manager && !managerEmail && !managerName) continue;
      if (!manager) {
        result.skipped.push({ row: index + 1, reason: `manager not found (${row.reportsToEmail || row.reportsToName})` });
        continue;
      }
      if (manager.id === id) continue;
      const linked = await this.client.from("profiles").update({ reports_to: manager.id }).eq("id", id);
      if (linked.error) result.skipped.push({ row: index + 1, reason: linked.error.message });
    }

    return result;
  }

  async updateProfile(id: string, patch: Partial<Omit<Profile, "id">>): Promise<Profile> {
    const payload: Database["public"]["Tables"]["profiles"]["Update"] = {};
    if (patch.fullName !== undefined) payload.full_name = patch.fullName;
    if (patch.email !== undefined) payload.email = patch.email?.trim().toLowerCase() || null;
    if (patch.phone !== undefined) payload.phone = patch.phone;
    if (patch.role !== undefined) payload.role = patch.role;
    if (patch.siteId !== undefined) payload.site_id = patch.siteId;
    if (patch.allSites !== undefined) payload.all_sites = patch.allSites;
    if (patch.siteIds !== undefined) payload.site_ids = patch.siteIds;
    if (patch.employeeNo !== undefined) payload.employee_no = patch.employeeNo;
    if (patch.reportsTo !== undefined) payload.reports_to = patch.reportsTo;
    if (patch.language !== undefined) payload.language = patch.language;
    if (patch.active !== undefined) payload.active = patch.active;
    const result = await this.client.from("profiles").update(payload).eq("id", id).select(PROFILE_SELECT).single();
    if (result.error) throw result.error;
    return mapProfile(result.data as unknown as ProfileQueryRow);
  }

  async removeProfile(id: string): Promise<void> {
    const result = await this.client.from("profiles").delete().eq("id", id);
    if (result.error) throw result.error;
  }

  // --- Tasks --------------------------------------------------------------

  async listTasks(): Promise<Task[]> {
    const result = await this.client.from("tasks").select(TASK_SELECT).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return ((result.data ?? []) as unknown as TaskQueryRow[]).map(mapTask);
  }

  async createTask(input: CreateTaskInput, createdById: string | null): Promise<Task> {
    const result = await this.client
      .from("tasks")
      .insert({
        title: input.title.trim(),
        description: input.description.trim() || null,
        priority: input.priority,
        assignee_id: input.assigneeId,
        site_id: input.siteId,
        incident_id: input.incidentId,
        due_date: input.dueDate,
        created_by: createdById,
      })
      .select(TASK_SELECT)
      .single();
    if (result.error) throw result.error;
    return mapTask(result.data as unknown as TaskQueryRow);
  }

  async updateTask(id: string, patch: UpdateTaskInput): Promise<Task> {
    const payload: Database["public"]["Tables"]["tasks"]["Update"] = {};
    if (patch.status !== undefined) {
      payload.status = patch.status;
      payload.completed_at = patch.status === "done" ? new Date().toISOString() : null;
    }
    if (patch.feedback !== undefined) payload.feedback = patch.feedback.trim() || null;
    if (patch.assigneeId !== undefined) payload.assignee_id = patch.assigneeId;
    if (patch.dueDate !== undefined) payload.due_date = patch.dueDate;
    if (patch.priority !== undefined) payload.priority = patch.priority;
    const result = await this.client.from("tasks").update(payload).eq("id", id).select(TASK_SELECT).single();
    if (result.error) throw result.error;
    return mapTask(result.data as unknown as TaskQueryRow);
  }

  // -------------------------------------------------------------------------
  // Checklist templates and audits
  // -------------------------------------------------------------------------

  async listTemplates(): Promise<ChecklistTemplate[]> {
    const result = await this.client.from("checklist_templates").select("*").order("name");
    if (result.error) throw result.error;
    return (result.data ?? []).map(mapTemplate);
  }

  async createTemplate(input: CreateTemplateInput, createdById: string | null): Promise<ChecklistTemplate> {
    const result = await this.client
      .from("checklist_templates")
      .insert({
        name: input.name.trim(),
        description: input.description.trim() || null,
        items: input.items as unknown as Json,
        created_by: createdById,
      })
      .select("*")
      .single();
    if (result.error) throw result.error;
    return mapTemplate(result.data);
  }

  async updateTemplate(id: string, patch: Partial<CreateTemplateInput & { active: boolean }>): Promise<ChecklistTemplate> {
    const payload: Database["public"]["Tables"]["checklist_templates"]["Update"] = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.description !== undefined) payload.description = patch.description.trim() || null;
    if (patch.items !== undefined) payload.items = patch.items as unknown as Json;
    if (patch.active !== undefined) payload.active = patch.active;
    const result = await this.client.from("checklist_templates").update(payload).eq("id", id).select("*").single();
    if (result.error) throw result.error;
    return mapTemplate(result.data);
  }

  async listAudits(): Promise<Audit[]> {
    const result = await this.client.from("audits").select(AUDIT_SELECT).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return ((result.data ?? []) as unknown as AuditQueryRow[]).map(mapAudit);
  }

  async createAudit(input: CreateAuditInput, createdById: string | null): Promise<Audit> {
    const template = await this.client.from("checklist_templates").select("*").eq("id", input.templateId).single();
    if (template.error) throw template.error;
    const mapped = mapTemplate(template.data);
    const items: AuditItemResult[] = mapped.items.map((item) => ({
      key: item.key,
      title: item.title,
      status: null,
      note: "",
      dueDate: null,
      assigneeId: null,
      incidentId: null,
    }));
    const result = await this.client
      .from("audits")
      .insert({
        template_id: mapped.id,
        template_name: mapped.name,
        site_id: input.siteId,
        assignee_id: input.assigneeId,
        due_date: input.dueDate,
        created_by: createdById,
        items: items as unknown as Json,
      })
      .select(AUDIT_SELECT)
      .single();
    if (result.error) throw result.error;
    return mapAudit(result.data as unknown as AuditQueryRow);
  }

  async updateAudit(id: string, patch: UpdateAuditInput): Promise<Audit> {
    const existing = await this.client.from("audits").select(AUDIT_SELECT).eq("id", id).single();
    if (existing.error) throw existing.error;
    const audit = mapAudit(existing.data as unknown as AuditQueryRow);
    let items = patch.items ?? audit.items;

    // Submitting raises a hazard for every failed line that has none yet.
    if (patch.status === "submitted") {
      if (!audit.siteId) throw new Error("The audit needs a site before failed items can become hazards.");
      const owners = new Map<string, string>();
      const ownerIds = [...new Set(items.map((item) => item.assigneeId).filter((value): value is string => Boolean(value)))];
      if (ownerIds.length) {
        const profiles = await this.client.from("profiles").select("id, full_name").in("id", ownerIds);
        for (const row of profiles.data ?? []) owners.set(row.id, row.full_name);
      }
      const next: AuditItemResult[] = [];
      for (const item of items) {
        if (item.status !== "fail" || item.incidentId) {
          next.push(item);
          continue;
        }
        const description = [item.title, item.note.trim()].filter(Boolean).join(" — ");
        const inserted = await this.client
          .from("incidents")
          .insert({
            site_id: audit.siteId,
            type: "hazard",
            category: "unclassified",
            categories: [],
            severity: "unrated",
            status: "open",
            description: description.length >= 8 ? description : `${description} (${audit.templateName})`,
            source: "audit",
            is_anonymous: false,
            reporter_name: audit.assigneeName ?? audit.createdByName ?? null,
            reporter_profile_id: audit.assigneeId,
            audit_id: audit.id,
            location: audit.templateName,
          })
          .select("id, reference")
          .single();
        if (inserted.error) throw inserted.error;
        if (item.dueDate || item.assigneeId) {
          const action = await this.client.from("actions").insert({
            incident_id: inserted.data.id,
            assignee_id: item.assigneeId,
            assignee_name: item.assigneeId ? (owners.get(item.assigneeId) ?? "") : "",
            due_date: item.dueDate,
            status: "open",
            notes: `${audit.templateName}: ${item.title}`,
          });
          if (action.error) throw action.error;
        }
        next.push({
          ...item,
          assigneeName: item.assigneeId ? (owners.get(item.assigneeId) ?? null) : null,
          incidentId: inserted.data.id,
          incidentReference: inserted.data.reference,
        });
      }
      items = next;
    }

    const payload: Database["public"]["Tables"]["audits"]["Update"] = {
      items: items as unknown as Json,
    };
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.note !== undefined) payload.note = patch.note.trim() || null;
    if (patch.assigneeId !== undefined) payload.assignee_id = patch.assigneeId;
    if (patch.dueDate !== undefined) payload.due_date = patch.dueDate;
    const result = await this.client.from("audits").update(payload).eq("id", id).select(AUDIT_SELECT).single();
    if (result.error) {
      const message = (result.error as { message?: string }).message ?? "";
      if (message.includes("open non-conformities")) throw new Error("AUDIT_OPEN_NONCONFORMITIES");
      throw result.error;
    }
    return mapAudit(result.data as unknown as AuditQueryRow);
  }

  // -------------------------------------------------------------------------
  // Companies and settings
  // -------------------------------------------------------------------------

  async listOrganizations(): Promise<Organization[]> {
    const result = await this.client.from("organizations").select("*").order("name");
    if (result.error) throw result.error;
    return (result.data ?? []).map(mapOrganization);
  }

  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    const result = await this.client
      .from("organizations")
      .insert({
        name: input.name.trim(),
        organization_number: input.organizationNumber?.trim() || null,
        address: input.address?.trim() || null,
        industry: input.industry?.trim() || null,
        slug: input.slug?.trim().toLowerCase() || null,
      })
      .select("*")
      .single();
    if (result.error) throw result.error;
    return mapOrganization(result.data);
  }

  async updateOrganization(id: string, patch: Partial<CreateOrganizationInput & { active: boolean }>): Promise<Organization> {
    const payload: Database["public"]["Tables"]["organizations"]["Update"] = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.organizationNumber !== undefined) payload.organization_number = patch.organizationNumber?.trim() || null;
    if (patch.address !== undefined) payload.address = patch.address?.trim() || null;
    if (patch.industry !== undefined) payload.industry = patch.industry?.trim() || null;
    if (patch.slug !== undefined) payload.slug = patch.slug?.trim().toLowerCase() || null;
    if (patch.active !== undefined) payload.active = patch.active;
    const result = await this.client.from("organizations").update(payload).eq("id", id).select("*").single();
    if (result.error) throw result.error;
    return mapOrganization(result.data);
  }

  async createSite(input: CreateSiteInput): Promise<Site> {
    const result = await this.client
      .from("sites")
      .insert({
        organization_id: input.organizationId,
        name: input.name.trim(),
        city: input.city?.trim() || null,
        address: input.address?.trim() || null,
      })
      .select(SITE_SELECT)
      .single();
    if (result.error) throw result.error;
    return mapSite(result.data as unknown as SiteQueryRow);
  }

  async updateSite(id: string, patch: { name?: string; city?: string | null; address?: string | null; active?: boolean }): Promise<void> {
    const payload: Database["public"]["Tables"]["sites"]["Update"] = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.city !== undefined) payload.city = patch.city?.trim() || null;
    if (patch.address !== undefined) payload.address = patch.address?.trim() || null;
    if (patch.active !== undefined) payload.active = patch.active;
    const result = await this.client.from("sites").update(payload).eq("id", id);
    if (result.error) throw result.error;
  }

  async createLocation(siteId: string, name: string): Promise<SiteLocation> {
    const count = await this.client.from("site_locations").select("id", { count: "exact", head: true }).eq("site_id", siteId);
    const result = await this.client
      .from("site_locations")
      .insert({ site_id: siteId, name: name.trim(), sort_order: (count.count ?? 0) + 1 })
      .select("id, name, latitude, longitude")
      .single();
    if (result.error) throw result.error;
    return { id: result.data.id, name: result.data.name, latitude: result.data.latitude, longitude: result.data.longitude };
  }

  async removeLocation(id: string): Promise<void> {
    const result = await this.client.from("site_locations").delete().eq("id", id);
    if (result.error) throw result.error;
  }

  async listRiskTypes(organizationId?: string | null): Promise<RiskType[]> {
    let query = this.client.from("risk_types").select("*").eq("active", true).order("sort_order").order("label");
    if (organizationId) query = query.eq("organization_id", organizationId);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data ?? []).map(mapRiskType);
  }

  async createRiskType(organizationId: string, label: string): Promise<RiskType> {
    const result = await this.client
      .from("risk_types")
      .insert({ organization_id: organizationId, label: label.trim().slice(0, 80) })
      .select("*")
      .single();
    if (result.error) throw result.error;
    return mapRiskType(result.data);
  }

  async removeRiskType(id: string): Promise<void> {
    const result = await this.client.from("risk_types").delete().eq("id", id);
    if (result.error) throw result.error;
  }

  async resolveReportKey(key: string): Promise<ReportTarget | null> {
    const result = await this.client.rpc("report_target", { p_key: key });
    if (result.error) throw result.error;
    const row = (result.data ?? [])[0];
    if (!row) return null;
    return {
      organizationId: row.organization_id,
      siteId: row.site_id,
      organizationName: row.organization_name,
      siteName: row.site_name,
      slug: row.slug,
    };
  }

  async listReportKeys(): Promise<ReportKey[]> {
    const result = await this.client.from("report_keys").select("*").eq("active", true);
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      siteId: row.site_id,
      key: row.key,
      createdAt: row.created_at,
    }));
  }

  async rotateReportKey(scope: { siteId?: string | null; organizationId?: string | null }): Promise<string> {
    const result = await this.client.rpc("rotate_report_key", {
      p_site_id: scope.siteId ?? null,
      p_organization_id: scope.siteId ? null : (scope.organizationId ?? null),
    });
    if (result.error) throw result.error;
    return result.data as string;
  }

  async listSubcontractors(organizationId?: string | null): Promise<Subcontractor[]> {
    let query = this.client.from("subcontractors").select("*").eq("active", true).order("name");
    if (organizationId) query = query.eq("organization_id", organizationId);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data ?? []).map(mapSubcontractor);
  }

  async createSubcontractor(organizationId: string, name: string): Promise<Subcontractor> {
    const result = await this.client
      .from("subcontractors")
      .insert({ organization_id: organizationId, name: name.trim().slice(0, 120) })
      .select("*")
      .single();
    if (result.error) throw result.error;
    return mapSubcontractor(result.data);
  }

  async removeSubcontractor(id: string): Promise<void> {
    const result = await this.client.from("subcontractors").delete().eq("id", id);
    if (result.error) throw result.error;
  }

  async requestMembership(input: MembershipRequestInput): Promise<"requested" | "already_member"> {
    const result = await this.client.rpc("request_membership", {
      p_organization_id: input.organizationId,
      p_email: input.email,
      p_name: input.name ?? null,
      p_site_id: input.siteId ?? null,
    });
    if (result.error) throw result.error;
    return result.data === "already_member" ? "already_member" : "requested";
  }

  async listMembershipRequests(): Promise<MembershipRequest[]> {
    const result = await this.client.from("membership_requests").select("*").eq("status", "pending").order("created_at");
    if (result.error) throw result.error;
    return (result.data ?? []).map(mapMembershipRequest);
  }

  async decideMembership(id: string, status: "approved" | "rejected", decidedBy: string | null): Promise<void> {
    const result = await this.client
      .from("membership_requests")
      .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (result.error) throw result.error;
  }

  async listOrgPeople(organizationId: string): Promise<SitePerson[]> {
    const result = await this.client.rpc("list_org_people", { p_organization_id: organizationId });
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      role: mapRole(row.role),
      employeeNo: row.employee_no,
    }));
  }

  /** Runs on the server so a login can be created without signing the manager out. */
  async createStaff(input: CreateStaffInput): Promise<CreateStaffResult> {
    const response = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => null)) as ({ ok?: boolean; error?: string } & Partial<CreateStaffResult>) | null;
    if (!response.ok || !body?.ok || !body.profile || !body.login) {
      throw new Error(body?.error || `Could not add the person (${response.status}).`);
    }
    return { profile: body.profile, login: body.login };
  }

  async trackIncident(code: string): Promise<TrackedIncident | null> {
    const result = await this.client.rpc("track_incident", { p_code: code });
    if (result.error) throw result.error;
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return row ? mapTracked(row) : null;
  }

  subscribeToIncidents(handler: RealtimeIncidentHandler) {
    const channel = this.client
      .channel("incidents-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incidents" },
        (payload) => {
          const id = (payload.new as { id?: string } | null)?.id;
          if (id) handler({ event: "INSERT", id });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "incidents" },
        (payload) => {
          const id = (payload.new as { id?: string } | null)?.id;
          if (id) handler({ event: "UPDATE", id });
        }
      )
      .subscribe();

    return () => {
      void this.client.removeChannel(channel);
    };
  }

  /** Signs every path once and returns a synchronous resolver for the mappers. */
  private async signMedia(paths: string[]): Promise<MediaUrlResolver> {
    const unique = [...new Set(paths)].filter(Boolean);
    if (!unique.length) return () => null;

    const signed = await this.client.storage.from(MEDIA_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
    const byPath = new Map<string, string>();
    if (!signed.error) {
      for (const item of signed.data ?? []) {
        if (item.signedUrl && !item.error) byPath.set(item.path ?? "", item.signedUrl);
      }
    }
    return (path) => byPath.get(path) ?? null;
  }

  private async uploadIncidentMedia(incidentId: string, input: CreateIncidentInput) {
    const uploads: { storage_path: string; kind: "photo" | "voice"; mime_type: string }[] = [];
    const stamp = Date.now();

    for (const [index, file] of (input.photoFiles ?? []).entries()) {
      const name = sanitizeFileName(file.name || `photo-${index + 1}.jpg`);
      const path = `incidents/${incidentId}/photo-${stamp}-${index}-${name}`;
      const mime = file.type || "image/jpeg";
      await this.upload(path, file, mime);
      uploads.push({ storage_path: path, kind: "photo", mime_type: mime });
    }

    if (input.audioFile && input.audioFile.size > 0) {
      const mime = input.audioFile.type || "audio/webm";
      const path = `incidents/${incidentId}/voice-${stamp}.${audioExtension(mime)}`;
      await this.upload(path, input.audioFile, mime);
      uploads.push({ storage_path: path, kind: "voice", mime_type: mime });
    }

    return uploads;
  }

  private async uploadWalkPhoto(walkId: string, itemKey: string, file?: File | null) {
    if (!file || file.size <= 0) return null;
    const path = `skyddsrond/${walkId}/${Date.now()}-${sanitizeFileName(file.name || `${itemKey}.jpg`)}`;
    await this.upload(path, file, file.type || "image/jpeg");
    return path;
  }

  private async upload(path: string, file: Blob, contentType: string) {
    const uploaded = await this.client.storage.from(MEDIA_BUCKET).upload(path, file, {
      contentType,
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
  }

  private async hydrateWalk(row: SafetyWalkQueryRow): Promise<SafetyWalk> {
    const items = row.safety_walk_items;
    const itemIds = (Array.isArray(items) ? items : items ? [items] : []).map((item) => item.id);

    const actionRows = itemIds.length
      ? ((await this.client.from("actions").select("*").in("safety_walk_item_id", itemIds)).data ?? [])
      : [];
    const actionByItemId = new Map(
      actionRows
        .filter((action) => action.safety_walk_item_id)
        .map((action) => [action.safety_walk_item_id as string, action])
    );

    const mediaUrl = await this.signMedia(walkMediaPaths(row));
    return mapSafetyWalk(row, actionByItemId, mediaUrl);
  }
}

export function createSupabaseRepository(): IncidentRepository {
  return new SupabaseIncidentRepository(createBrowserSupabaseClient());
}

