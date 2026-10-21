import { describe, expect, it } from "vitest";
import {
  incidentMediaPaths,
  isSkyddsrondIncident,
  isUuid,
  mapCategory,
  mapIncident,
  mapIncidentType,
  mapSafetyWalk,
  mapSeverity,
  mapSite,
  mapStatus,
  toSafetyWalkSummary,
  type IncidentQueryRow,
  type SafetyWalkQueryRow,
  type SiteQueryRow,
} from "@/lib/supabase/mappers";

const baseIncident: IncidentQueryRow = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  reference: "SS-2026-0010",
  organization_id: null,
  site_id: "site-1",
  location_id: "loc-1",
  location: "Legacy text location",
  type: "near_miss",
  category: "falling_objects",
  severity: "CRITICAL",
  status: "in_progress",
  description: "Pallet nearly fell.",
  source: "report",
  is_anonymous: true,
  reporter_name: null,
  alert_sent_at: null,
  original_language: "pl",
  original_text: "Paleta prawie spadła.",
  summary_sv: "En pall höll på att falla.",
  ai_confidence: 0.8,
  tracking_code: "K7FP-3M2X",
  public_note: null,
  ai_analysis: null,
  ai_analysis_language: null,
  ai_analyzed_at: null,
  reporter_profile_id: null,
  latitude: null,
  longitude: null,
  location_ids: [],
  categories: [],
  audit_id: null,
  location_note: null,
  type_note: null,
  hurt: null,
  danger_present: null,
  subcontractor: null,
  created_at: "2026-09-08T07:40:00.000Z",
  updated_at: null,
  sites: { id: "site-1", name: "Torslanda", city: "Gothenburg" },
  site_locations: { id: "loc-1", name: "Line B" },
  actions: [
    {
      id: "a-old",
      incident_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      safety_walk_id: null,
      safety_walk_item_id: null,
      title: null,
      description: null,
      assignee_id: "off-erik",
      assignee_name: "Erik",
      due_date: "2026-09-10",
      status: "open",
      notes: "older",
      created_at: "2026-09-08T08:00:00.000Z",
      updated_at: "2026-09-08T08:00:00.000Z",
    },
    {
      id: "a-new",
      incident_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      safety_walk_id: null,
      safety_walk_item_id: null,
      title: null,
      description: null,
      assignee_id: "off-anna",
      assignee_name: "Anna",
      due_date: "2026-09-12",
      status: "in-progress",
      notes: "newest",
      created_at: "2026-09-09T08:00:00.000Z",
      updated_at: "2026-09-09T08:00:00.000Z",
    },
  ],
  incident_attachments: [
    { id: "att-1", incident_id: "x", storage_path: "incidents/x/photo-1.jpg", kind: "photo", mime_type: "image/jpeg", created_at: "" },
    { id: "att-2", incident_id: "x", storage_path: "incidents/x/voice-1.m4a", kind: "voice", mime_type: "audio/mp4", created_at: "" },
  ],
};

describe("enum mappers", () => {
  it("normalises legacy spellings", () => {
    expect(mapIncidentType("near_miss")).toBe("near-miss");
    expect(mapIncidentType("Tillbud")).toBe("near-miss");
    expect(mapIncidentType("risk")).toBe("hazard");
    expect(mapIncidentType("anything-else")).toBe("other");
    expect(mapIncidentType("olycka")).toBe("accident");
    expect(mapSeverity("CRITICAL")).toBe("critical");
    expect(mapSeverity("unknown")).toBe("unrated");
    expect(mapStatus("in_progress")).toBe("in-progress");
    expect(mapStatus("weird")).toBe("open");
    expect(mapCategory("falling_objects")).toBe("falling-objects");
    expect(mapCategory("Glass breakage")).toBe("Glass breakage");
  });

  it("recognises uuids", () => {
    expect(isUuid("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isUuid("site-torslanda")).toBe(false);
  });
});

describe("mapIncident", () => {
  it("maps joined rows, picks the newest CAPA and resolves media through the resolver", () => {
    const incident = mapIncident(baseIncident, (path) => `https://cdn/${path}?sig`);

    expect(incident.reference).toBe("SS-2026-0010");
    expect(incident.type).toBe("near-miss");
    expect(incident.severity).toBe("critical");
    expect(incident.status).toBe("in-progress");
    expect(incident.siteName).toBe("Torslanda");
    expect(incident.locationName).toBe("Line B");
    expect(incident.anonymous).toBe(true);
    expect(incident.capa?.assigneeName).toBe("Anna");
    expect(incident.mediaUrls).toEqual(["https://cdn/incidents/x/photo-1.jpg?sig"]);
    expect(incident.audioUrl).toBe("https://cdn/incidents/x/voice-1.m4a?sig");
    expect(incident.source).toBe("report");
    expect(incident.originalLanguage).toBe("pl");
    expect(incident.summarySv).toBe("En pall höll på att falla.");
    expect(incident.trackingCode).toBe("K7FP-3M2X");
  });

  it("drops media the resolver cannot sign and falls back to the text location", () => {
    const incident = mapIncident({ ...baseIncident, site_locations: null, location_id: null });
    expect(incident.mediaUrls).toEqual([]);
    expect(incident.audioUrl).toBeNull();
    expect(incident.locationName).toBe("Legacy text location");
    expect(incident.locationId).toBe("");
  });

  it("derives a reference when the row has none and flags skyddsrond rows", () => {
    const incident = mapIncident({ ...baseIncident, reference: null, source: "skyddsrond" });
    expect(incident.reference).toBe("SS-0F8FAD5B");
    expect(isSkyddsrondIncident(incident)).toBe(true);
    expect(isSkyddsrondIncident({ source: "report", reference: "SR-2026-0001" })).toBe(true);
    expect(isSkyddsrondIncident({ source: "report", reference: "SS-2026-0001" })).toBe(false);
  });

  it("lists every attachment path for batch signing", () => {
    expect(incidentMediaPaths(baseIncident)).toEqual([
      "incidents/x/photo-1.jpg",
      "incidents/x/voice-1.m4a",
    ]);
  });
});

describe("mapSite", () => {
  const row: SiteQueryRow = {
    id: "site-1",
    organization_id: null,
    name: "Torslanda",
    city: null,
    address: null,
    created_at: "",
    latitude: null,
    longitude: null,
    active: true,
    organizations: { id: "org-1", name: "Volvo", organization_number: "556074-3089", address: "Torslandavägen" },
    site_locations: [
      { id: "b", name: "Second", sort_order: 1, latitude: null, longitude: null },
      { id: "a", name: "First", sort_order: 0, latitude: 57.72, longitude: 11.95 },
    ],
  };

  it("sorts locations and inherits organisation data", () => {
    const site = mapSite(row);
    expect(site.locations.map((item) => item.name)).toEqual(["First", "Second"]);
    expect(site.organizationId).toBe("org-1");
    expect(site.organizationNumber).toBe("556074-3089");
    expect(site.address).toBe("Torslandavägen");
    expect(site.city).toBe("");
  });

  it("has no areas when the site has none (areas are optional)", () => {
    const site = mapSite({ ...row, site_locations: [] });
    expect(site.locations).toEqual([]);
    expect(site.active).toBe(true);
  });
});

describe("safety walks", () => {
  const walk: SafetyWalkQueryRow = {
    id: "walk-1",
    organization_id: null,
    site_id: "site-1",
    title: "Skyddsrond",
    skyddsombud_name: "Maria",
    skyddsombud_role: "Skyddsombud",
    completed_at: "2026-09-01T13:20:00.000Z",
    created_at: "",
    sites: { id: "site-1", name: "Kvillebäcken" },
    safety_walk_items: [
      { id: "i2", safety_walk_id: "walk-1", domain: "ppe", item_key: "ppe-helmet", title: "Helmets", status: "deviation", notes: "x", photo_path: "skyddsrond/walk-1/p.jpg", sort_order: 2, created_at: "" },
      { id: "i1", safety_walk_id: "walk-1", domain: "fall_protection", item_key: "fall-edge", title: "Edges", status: "avvikelse", notes: null, photo_path: null, sort_order: 1, created_at: "" },
      { id: "i0", safety_walk_id: "walk-1", domain: "ppe", item_key: "ppe-boots", title: "Boots", status: "ok", notes: null, photo_path: null, sort_order: 0, created_at: "" },
    ],
  };

  it("orders items, maps action status and counts deviations", () => {
    const actions = new Map([
      ["i1", { id: "a1", status: "resolved" } as never],
      ["i2", { id: "a2", status: "pending" } as never],
    ]);
    const mapped = mapSafetyWalk(walk, actions, (path) => `signed:${path}`);
    expect(mapped.items.map((item) => item.itemKey)).toEqual(["ppe-boots", "fall-edge", "ppe-helmet"]);
    expect(mapped.items[1].status).toBe("deviation");
    expect(mapped.items[1].domain).toBe("fall-protection");
    expect(mapped.items[1].actionStatus).toBe("resolved");
    expect(mapped.items[2].actionStatus).toBe("pending");
    expect(mapped.items[2].photoUrl).toBe("signed:skyddsrond/walk-1/p.jpg");

    const summary = toSafetyWalkSummary(mapped);
    expect(summary.deviationCount).toBe(2);
    expect(summary.resolvedDeviations).toBe(1);
    expect(summary.activeDeviations).toBe(1);
    expect(summary.siteName).toBe("Kvillebäcken");
  });
});
