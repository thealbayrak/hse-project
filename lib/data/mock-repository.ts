import { computeMetrics, sortIncidents } from "@/lib/data/metrics";
import type { IncidentRepository } from "@/lib/data/repository";
import { SEED_INCIDENTS } from "@/lib/data/seed-incidents";
import { SEED_SAFETY_WALKS } from "@/lib/data/seed-walks";
import { findLocation, findSite, SITES } from "@/lib/data/sites";
import { toSafetyWalkSummary } from "@/lib/supabase/mappers";
import type { CreateIncidentInput, CreateSafetyWalkInput, Incident, SafetyWalk, UpdateCapaInput } from "@/lib/types";

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
  let walks: SafetyWalk[] = structuredClone(SEED_SAFETY_WALKS);

  return {
    async listSites() {
      return structuredClone(SITES);
    },

    async listIncidents() {
      return sortIncidents(structuredClone(incidents)).map(withPlaceNames);
    },

    async getIncident(id) {
      const found = incidents.find((incident) => incident.id === id);
      return found ? withPlaceNames(structuredClone(found)) : null;
    },

    async createIncident(input: CreateIncidentInput) {
      const created: Incident = {
        id: `inc-${crypto.randomUUID().slice(0, 8)}`,
        reference: nextReference(incidents),
        type: input.type,
        siteId: input.siteId,
        locationId: input.locationId,
        category: input.category,
        severity: input.severity,
        description: input.description,
        mediaUrls: input.mediaUrls,
        audioUrl: objectUrl(input.audioFile),
        originalLanguage: input.originalLanguage ?? null,
        originalText: input.originalText ?? null,
        summarySv: input.summarySv ?? null,
        trackingCode: generateTrackingCode(),
        publicNote: null,
        anonymous: input.anonymous,
        reporterName: input.anonymous ? null : input.reporterName,
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

      const { severity, publicNote, ...capaFields } = capa;
      const updated: Incident = {
        ...incidents[index],
        status: capa.status,
        severity: severity ?? incidents[index].severity,
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
