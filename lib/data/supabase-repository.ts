import { computeMetrics } from "@/lib/data/metrics";
import type { IncidentRepository, RealtimeIncidentHandler } from "@/lib/data/repository";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { addBusinessDaysIsoDate } from "@/lib/skyddsrond/business-days";
import type { Database, SafetyWalkItemRow } from "@/lib/supabase/database.types";
import {
  isSkyddsrondIncident,
  isUuid,
  mapIncident,
  mapSafetyWalk,
  mapSite,
  toSafetyWalkSummary,
  type IncidentQueryRow,
  type SafetyWalkQueryRow,
  type SiteQueryRow,
} from "@/lib/supabase/mappers";
import type {
  CreateIncidentInput,
  CreateSafetyWalkInput,
  Incident,
  SafetyWalk,
  SafetyWalkSummary,
  Site,
  UpdateCapaInput,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const MEDIA_BUCKET = "incident-media";

const INCIDENT_SELECT = `
  *,
  sites ( id, name, city ),
  site_locations ( id, name ),
  actions ( * ),
  incident_attachments ( * )
`;

type Client = SupabaseClient<Database>;

export class SupabaseIncidentRepository implements IncidentRepository {
  constructor(private readonly client: Client) {}

  async listSites(): Promise<Site[]> {
    const selects = [
      "id, name, city, address, organization_id, organization_number, organizations ( id, name, organization_number, address ), site_locations ( id, name )",
      "id, name, city, organization_id, organizations ( id, name ), site_locations ( id, name )",
      "id, name, city, organization_id",
    ];

    let lastError: { message?: string } | null = null;
    for (const select of selects) {
      const result = await this.client.from("sites").select(select).order("name");
      if (!result.error && result.data) {
        return (result.data as unknown as SiteQueryRow[]).map(mapSite);
      }
      lastError = result.error;
    }

    throw lastError ?? new Error("Could not load sites.");
  }

  async listIncidents(): Promise<Incident[]> {
    const rich = await this.client
      .from("incidents")
      .select(INCIDENT_SELECT)
      .order("created_at", { ascending: false });

    if (!rich.error) {
      return ((rich.data ?? []) as IncidentQueryRow[])
        .map(mapIncident)
        .filter((incident) => !isSkyddsrondIncident(incident));
    }

    const basic = await this.client
      .from("incidents")
      .select("*, sites ( id, name, city ), actions ( * ), incident_attachments ( * )")
      .order("created_at", { ascending: false });

    if (basic.error) throw rich.error;
    return ((basic.data ?? []) as IncidentQueryRow[])
      .map(mapIncident)
      .filter((incident) => !isSkyddsrondIncident(incident));
  }

  async getIncident(id: string): Promise<Incident | null> {
    const rich = await this.client
      .from("incidents")
      .select(INCIDENT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (!rich.error) {
      return rich.data ? mapIncident(rich.data as IncidentQueryRow) : null;
    }

    const basic = await this.client
      .from("incidents")
      .select("*, sites ( id, name, city ), actions ( * ), incident_attachments ( * )")
      .eq("id", id)
      .maybeSingle();

    if (basic.error) throw rich.error;
    return basic.data ? mapIncident(basic.data as IncidentQueryRow) : null;
  }

  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const sites = await this.listSites();
    const site = sites.find((item) => item.id === input.siteId);
    const location = site?.locations.find((item) => item.id === input.locationId);

    const payload = {
      site_id: input.siteId,
      location_id:
        isUuid(input.locationId) && input.locationId !== input.siteId ? input.locationId : null,
      location: location?.name ?? input.locationId,
      type: input.type,
      category: input.category,
      severity: input.severity,
      status: "open",
      description: input.description,
      is_anonymous: input.anonymous,
      reporter_name: input.reporterName,
    };

    const inserted = await this.insertIncident(payload, input.anonymous);
    await this.uploadAttachments(inserted.id, input);

    const created = await this.getIncident(inserted.id);
    if (!created) throw new Error("Incident was saved but could not be reloaded.");
    return created;
  }

  async updateCapa(incidentId: string, capa: UpdateCapaInput): Promise<Incident> {
    const statusUpdate = await this.client
      .from("incidents")
      .update({ status: capa.status, updated_at: new Date().toISOString() })
      .eq("id", incidentId);

    if (statusUpdate.error) throw statusUpdate.error;

    const existing = await this.client
      .from("actions")
      .select("id")
      .eq("incident_id", incidentId)
      .order("updated_at", { ascending: false })
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
      updated_at: new Date().toISOString(),
    };

    if (existing.data?.id) {
      const updated = await this.client.from("actions").update(actionPayload).eq("id", existing.data.id);
      if (updated.error) throw updated.error;
    } else {
      const created = await this.client.from("actions").insert(actionPayload);
      if (created.error) throw created.error;
    }

    const incident = await this.getIncident(incidentId);
    if (!incident) throw new Error("CAPA was saved but the incident could not be reloaded.");
    return incident;
  }

  async getMetrics() {
    const incidents = await this.listIncidents();
    return computeMetrics(incidents);
  }

  async getLatestSafetyWalk(): Promise<SafetyWalkSummary | null> {
    const walk = await this.loadLatestWalk();
    return walk ? toSafetyWalkSummary(walk) : null;
  }

  async createSafetyWalk(input: CreateSafetyWalkInput): Promise<SafetyWalk> {
    const sites = await this.listSites();
    const site = sites.find((item) => item.id === input.siteId);
    const completedAt = new Date().toISOString();
    const dueDate = addBusinessDaysIsoDate(new Date(), 3);
    const walkId = await this.insertWalk({
      site_id: input.siteId,
      organization_id: site?.organizationId ?? null,
      title: input.title,
      skyddsombud_name: input.skyddsombudName,
      skyddsombud_role: input.skyddsombudRole,
      skyddsombud: `${input.skyddsombudName}${input.skyddsombudRole ? ` · ${input.skyddsombudRole}` : ""}`,
      attending_skyddsombud: input.skyddsombudName,
      completed_at: completedAt,
    });

    const itemRows = [];
    for (const [index, item] of input.items.entries()) {
      const photo = await this.uploadWalkPhoto(walkId, item.itemKey, item.photoFile);
      itemRows.push({
        safety_walk_id: walkId,
        domain: item.domain,
        item_key: item.itemKey,
        title: item.title,
        status: item.status,
        notes: item.notes.trim() || null,
        photo_url: photo?.url ?? null,
        photo_path: photo?.path ?? null,
        sort_order: item.sortOrder ?? index,
      });
    }

    const insertedItems = await this.insertWalkItems(itemRows);
    const deviations = insertedItems.filter((item) => item.status === "deviation");

    for (const item of deviations) {
      const notes = item.notes?.trim() || "Deviation recorded during skyddsrond.";
      await this.insertWalkAction({
        walkId,
        itemId: item.id,
        siteId: input.siteId,
        organizationId: site?.organizationId ?? null,
        locationId: site?.locations[0]?.id ?? input.siteId,
        locationName: site?.locations[0]?.name ?? site?.name ?? "Site",
        title: `[Skyddsrond] ${item.title}`,
        description: notes,
        dueDate,
        assigneeName: input.skyddsombudName,
      });
    }

    const created = await this.getSafetyWalk(walkId);
    if (!created) throw new Error("Skyddsrond was saved but could not be reloaded.");
    return created;
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

  private async insertIncident(
    payload: {
      site_id: string;
      location_id: string | null;
      location: string;
      type: string;
      category: string;
      severity: string;
      status: string;
      description: string;
      is_anonymous: boolean;
      reporter_name: string | null;
    },
    anonymous: boolean
  ) {
    const firstTry = await this.client.from("incidents").insert(payload).select("id").single();
    if (!firstTry.error && firstTry.data) return firstTry.data;

    const { location: _location, is_anonymous: _anon, ...minimal } = payload;
    const secondTry = await this.client
      .from("incidents")
      .insert({ ...minimal, anonymous })
      .select("id")
      .single();
    if (secondTry.error || !secondTry.data) throw firstTry.error;
    return secondTry.data;
  }

  private async uploadAttachments(incidentId: string, input: CreateIncidentInput) {
    const stamp = Date.now();
    const files: { file: Blob; path: string; kind: "photo" | "voice"; mime: string }[] = [];

    (input.photoFiles ?? []).forEach((file, index) => {
      const safeName = sanitizeFileName(file.name || `photo-${index + 1}.jpg`);
      files.push({
        file,
        path: `photos/${stamp}-${index}-${safeName}`,
        kind: "photo",
        mime: file.type || "image/jpeg",
      });
    });

    if (input.audioFile && input.audioFile.size > 0) {
      files.push({
        file: input.audioFile,
        path: `voice-reports/${stamp}.webm`,
        kind: "voice",
        mime: input.audioFile.type || "audio/webm",
      });
    }

    for (const item of files) {
      const uploaded = await this.client.storage.from(MEDIA_BUCKET).upload(item.path, item.file, {
        contentType: item.mime,
        upsert: false,
      });
      if (uploaded.error) throw uploaded.error;

      const url = await this.resolveMediaUrl(item.path);
      const attached = await this.client.from("incident_attachments").insert({
        incident_id: incidentId,
        storage_path: item.path,
        url,
        kind: item.kind,
        mime_type: item.mime,
      });
      if (attached.error) throw attached.error;
    }
  }

  private async resolveMediaUrl(path: string) {
    const publicUrl = this.client.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
    const signed = await this.client.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
    return signed.data?.signedUrl ?? publicUrl;
  }

  private async loadLatestWalk(): Promise<SafetyWalk | null> {
    const result = await this.client
      .from("safety_walks")
      .select("*, sites ( id, name ), safety_walk_items ( * )")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error || !result.data) return null;
    return this.hydrateWalk(result.data as SafetyWalkQueryRow);
  }

  private async getSafetyWalk(id: string): Promise<SafetyWalk | null> {
    const result = await this.client
      .from("safety_walks")
      .select("*, sites ( id, name ), safety_walk_items ( * )")
      .eq("id", id)
      .maybeSingle();

    if (result.error || !result.data) return null;
    return this.hydrateWalk(result.data as SafetyWalkQueryRow);
  }

  private async hydrateWalk(row: SafetyWalkQueryRow): Promise<SafetyWalk> {
    const items = row.safety_walk_items;
    const itemIds = (Array.isArray(items) ? items : items ? [items] : []).map((item) => item.id);
    const actionsResult = itemIds.length
      ? await this.client.from("actions").select("*").in("safety_walk_item_id", itemIds)
      : { data: [] as import("@/lib/supabase/database.types").ActionRow[], error: null };

    const actionRows = actionsResult.error ? [] : (actionsResult.data ?? []);
    const actionByItemId = new Map(
      actionRows
        .filter((action) => action.safety_walk_item_id)
        .map((action) => [action.safety_walk_item_id as string, action])
    );

    return mapSafetyWalk(row, actionByItemId);
  }

  private async insertWalk(payload: {
    site_id: string;
    organization_id: string | null;
    title: string;
    skyddsombud_name: string;
    skyddsombud_role: string;
    skyddsombud: string;
    attending_skyddsombud: string;
    completed_at: string;
  }) {
    const attempts = [
      payload,
      {
        site_id: payload.site_id,
        title: payload.title,
        skyddsombud_name: payload.skyddsombud_name,
        skyddsombud_role: payload.skyddsombud_role,
        completed_at: payload.completed_at,
      },
      {
        site_id: payload.site_id,
        title: payload.title,
        attending_skyddsombud: payload.attending_skyddsombud,
        completed_at: payload.completed_at,
      },
      {
        site_id: payload.site_id,
        title: payload.title,
        skyddsombud: payload.skyddsombud,
        completed_at: payload.completed_at,
      },
    ];

    let lastError: { message?: string } | null = null;
    for (const body of attempts) {
      const result = await this.client
        .from("safety_walks")
        .insert(body as Database["public"]["Tables"]["safety_walks"]["Insert"])
        .select("id")
        .single();
      if (!result.error && result.data?.id) return result.data.id;
      lastError = result.error;
    }
    throw lastError ?? new Error("Could not save the skyddsrond.");
  }

  private async insertWalkItems(
    rows: {
      safety_walk_id: string;
      domain: string;
      item_key: string;
      title: string;
      status: string;
      notes: string | null;
      photo_url: string | null;
      photo_path: string | null;
      sort_order: number;
    }[]
  ): Promise<Pick<SafetyWalkItemRow, "id" | "title" | "status" | "notes">[]> {
    const full = await this.client.from("safety_walk_items").insert(rows).select("id, title, status, notes");
    if (!full.error && full.data) return full.data;

    const minimal = rows.map(({ photo_url: _url, photo_path: _path, ...row }) => row);
    const second = await this.client.from("safety_walk_items").insert(minimal).select("id, title, status, notes");
    if (second.error || !second.data) throw full.error ?? second.error;
    return second.data;
  }

  private async uploadWalkPhoto(walkId: string, itemKey: string, file?: File | null) {
    if (!file || file.size <= 0) return null;
    const path = `skyddsrond/${walkId}/${Date.now()}-${sanitizeFileName(file.name || `${itemKey}.jpg`)}`;
    const uploaded = await this.client.storage.from(MEDIA_BUCKET).upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    return { path, url: await this.resolveMediaUrl(path) };
  }

  private async insertWalkAction(input: {
    walkId: string;
    itemId: string;
    siteId: string;
    organizationId: string | null;
    locationId: string;
    locationName: string;
    title: string;
    description: string;
    dueDate: string;
    assigneeName: string;
  }) {
    const attempts = [
      {
        title: input.title,
        description: input.description,
        status: "pending",
        due_date: input.dueDate,
        notes: input.description,
        assignee_name: input.assigneeName,
        safety_walk_id: input.walkId,
        safety_walk_item_id: input.itemId,
      },
      {
        title: input.title,
        description: input.description,
        status: "pending",
        due_date: input.dueDate,
        notes: input.description,
        assignee_name: input.assigneeName,
      },
    ];

    for (const body of attempts) {
      const result = await this.client
        .from("actions")
        .insert(body as Database["public"]["Tables"]["actions"]["Insert"]);
      if (!result.error) return;
    }

    const incidentId = await this.insertWalkIncident(input);
    const linked = await this.client.from("actions").insert({
      incident_id: incidentId,
      status: "pending",
      due_date: input.dueDate,
      notes: `${input.title}\n${input.description}`,
      assignee_name: input.assigneeName,
      title: input.title,
      description: input.description,
    });
    if (linked.error) throw linked.error;
  }

  private async insertWalkIncident(input: {
    siteId: string;
    organizationId: string | null;
    locationId: string;
    locationName: string;
    title: string;
    description: string;
    assigneeName: string;
  }) {
    const payload = {
      site_id: input.siteId,
      organization_id: input.organizationId,
      location_id: isUuid(input.locationId) ? input.locationId : null,
      location: input.locationName,
      type: "hazard",
      category: "falls",
      severity: "high",
      status: "open",
      description: `${input.title}\n${input.description}`,
      source: "skyddsrond",
      reporter_name: input.assigneeName,
      is_anonymous: false,
      reference: `SR-${Date.now().toString(36).toUpperCase()}`,
    };

    const first = await this.client.from("incidents").insert(payload).select("id").single();
    if (!first.error && first.data?.id) return first.data.id;

    const { source: _source, organization_id: _org, location: _loc, ...minimal } = payload;
    const second = await this.client.from("incidents").insert(minimal).select("id").single();
    if (second.error || !second.data?.id) throw first.error ?? second.error;
    return second.data.id;
  }
}

export function createSupabaseRepository(): IncidentRepository {
  return new SupabaseIncidentRepository(createBrowserSupabaseClient());
}

function sanitizeFileName(name: string) {
  return name.replaceAll(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 80);
}
