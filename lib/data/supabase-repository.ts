import { computeMetrics } from "@/lib/data/metrics";
import type { IncidentRepository, RealtimeIncidentHandler } from "@/lib/data/repository";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { audioExtension, sanitizeFileName } from "@/lib/media";
import { addBusinessDaysIsoDate } from "@/lib/skyddsrond/business-days";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  incidentMediaPaths,
  isSkyddsrondIncident,
  mapContact,
  mapIncident,
  mapSafetyWalk,
  mapSite,
  mapTracked,
  toSafetyWalkSummary,
  walkMediaPaths,
  type IncidentQueryRow,
  type MediaUrlResolver,
  type SafetyWalkQueryRow,
  type SiteQueryRow,
} from "@/lib/supabase/mappers";
import type {
  Contact,
  CreateIncidentInput,
  CreateSafetyWalkInput,
  Incident,
  IncidentAnalysis,
  IncidentStatus,
  SafetyWalk,
  SafetyWalkSummary,
  Site,
  TrackedIncident,
  UpdateCapaInput,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_BUCKET = "incident-media";

/** Signed URLs live this long; they are re-signed on every read so they never go stale in the UI. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 4;

const SITE_SELECT =
  "*, organizations ( id, name, organization_number, address ), site_locations ( id, name, sort_order )";

const INCIDENT_SELECT = `
  *,
  sites ( id, name, city ),
  site_locations ( id, name ),
  actions ( * ),
  incident_attachments ( * )
`;

const WALK_SELECT = "*, sites ( id, name ), safety_walk_items ( * )";

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

    const rpc = await this.client.rpc("submit_incident", {
      p_id: id,
      p_site_id: input.siteId,
      p_location_id: input.locationId && input.locationId !== input.siteId ? input.locationId : null,
      p_type: input.type,
      p_category: input.category,
      p_severity: input.severity,
      p_description: input.description,
      p_is_anonymous: input.anonymous,
      p_reporter_name: input.reporterName,
      p_attachments: attachments,
      p_original_language: input.originalLanguage ?? null,
      p_original_text: input.originalText ?? null,
      p_summary_sv: input.summarySv ?? null,
      p_ai_confidence: input.aiConfidence ?? null,
    });
    if (rpc.error) throw rpc.error;

    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (!row) throw new Error("The report was not accepted by the server.");

    // Anonymous reporters cannot read incidents back (RLS), so the created
    // incident is assembled locally; the dashboard reloads it with full data.
    const sites = await this.listSites();
    const site = sites.find((item) => item.id === input.siteId);
    const location = site?.locations.find((item) => item.id === input.locationId);
    return {
      id: row.id,
      reference: row.reference,
      type: input.type,
      siteId: input.siteId,
      locationId: input.locationId,
      siteName: site?.name,
      locationName: location?.name,
      category: input.category,
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
      due_date: capa.dueDate,
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

