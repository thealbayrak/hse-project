import { describe, expect, it } from "vitest";
import {
  requiresArbetsmiljoverketReport,
  shouldDispatchCriticalAlert,
  toCriticalIncidentAlertPayload,
} from "@/lib/alerts/critical-incident";
import { buildCriticalIncidentEmail } from "@/lib/alerts/critical-incident-email";
import { parseAlertRequest, parseClientPayload } from "@/lib/alerts/parse-alert-request";
import type { Incident } from "@/lib/types";

const incident: Incident = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  reference: "SS-2026-0196",
  type: "near-miss",
  siteId: "site",
  locationId: "loc",
  siteName: "Kvillebäcken",
  locationName: "Zone 3",
  category: "falls",
  severity: "critical",
  description: "<b>Toe-board</b> missing & wrench nearly fell.",
  mediaUrls: [],
  anonymous: false,
  reporterName: "Site worker",
  status: "open",
  createdAt: "2026-09-08T07:40:00.000Z",
  capa: null,
};

describe("alert rules", () => {
  it("only critical incidents trigger the alert", () => {
    expect(shouldDispatchCriticalAlert({ severity: "critical" })).toBe(true);
    expect(shouldDispatchCriticalAlert({ severity: "high" })).toBe(false);
  });

  it("accidents always need an Arbetsmiljöverket report", () => {
    expect(requiresArbetsmiljoverketReport({ severity: "low", type: "accident" })).toBe(true);
    expect(requiresArbetsmiljoverketReport({ severity: "high", type: "hazard" })).toBe(false);
  });

  it("builds the client payload from the incident", () => {
    const payload = toCriticalIncidentAlertPayload(incident);
    expect(payload.incidentId).toBe(incident.id);
    expect(payload.title).toBe("SS-2026-0196");
    expect(payload.siteName).toBe("Kvillebäcken");
    expect(payload.specificLocation).toBe("Zone 3");
    expect(payload.requiresArbetsmiljoverketReport).toBe(true);
  });
});

describe("parseAlertRequest", () => {
  it("recognises a Supabase database webhook body", () => {
    const parsed = parseAlertRequest({
      type: "INSERT",
      table: "incidents",
      record: { id: incident.id, severity: "critical" },
    });
    expect(parsed).toEqual({ kind: "webhook", incidentId: incident.id });
  });

  it("rejects webhook bodies without a uuid id", () => {
    expect(parseAlertRequest({ type: "INSERT", record: { id: "nope" } })).toBeNull();
  });

  it("accepts the client payload and keeps it when complete", () => {
    const payload = toCriticalIncidentAlertPayload(incident);
    const parsed = parseAlertRequest(payload);
    expect(parsed?.kind).toBe("client");
    expect(parsed && parsed.kind === "client" ? parsed.payload : null).toEqual(payload);
  });

  it("keeps only the id when the client payload is malformed", () => {
    const parsed = parseAlertRequest({ incidentId: incident.id, severity: "nuclear" });
    expect(parsed).toEqual({ kind: "client", incidentId: incident.id, payload: null });
    expect(parseClientPayload({ incidentId: incident.id })).toBeNull();
  });

  it("rejects garbage", () => {
    expect(parseAlertRequest(null)).toBeNull();
    expect(parseAlertRequest("x")).toBeNull();
    expect(parseAlertRequest({})).toBeNull();
  });
});

describe("buildCriticalIncidentEmail", () => {
  it("escapes HTML and links to the incident", () => {
    const email = buildCriticalIncidentEmail(
      toCriticalIncidentAlertPayload(incident),
      "https://app.example/dashboard?incidentId=abc"
    );
    expect(email.subject).toContain("SS-2026-0196");
    expect(email.html).not.toContain("<b>Toe-board</b>");
    expect(email.html).toContain("&lt;b&gt;Toe-board&lt;/b&gt;");
    expect(email.html).toContain("https://app.example/dashboard?incidentId=abc");
    expect(email.text).toContain("Kvillebäcken");
  });
});
