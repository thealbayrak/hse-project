import { describe, expect, it } from "vitest";
import { matchesFilters, tabOf } from "@/components/dashboard/dashboard-view";
import { mapCategories, mapCategory, mapIncidentType } from "@/lib/supabase/mappers";
import { deriveSeverity } from "@/lib/report/severity";
import { incidentCategories, type Incident } from "@/lib/types";

function incident(overrides: Partial<Incident>): Incident {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    reference: "SS-2026-0001",
    type: "hazard",
    siteId: "site-a",
    locationId: "",
    category: "unclassified",
    severity: "low",
    description: "x",
    mediaUrls: [],
    anonymous: false,
    reporterName: "Ali",
    status: "open",
    createdAt: "2026-10-10T10:00:00.000Z",
    capa: null,
    ...overrides,
  };
}

describe("tabOf", () => {
  it("puts accidents in their own tab whatever the source", () => {
    expect(tabOf(incident({ type: "accident", source: "skyddsrond" }))).toBe("accidents");
  });
  it("groups walk and audit findings together", () => {
    expect(tabOf(incident({ source: "skyddsrond" }))).toBe("audits");
    expect(tabOf(incident({ source: "audit" }))).toBe("audits");
  });
  it("treats everything else as an observation", () => {
    expect(tabOf(incident({ type: "good-observation" }))).toBe("observations");
    expect(tabOf(incident({ type: "environmental" }))).toBe("observations");
  });
});

describe("matchesFilters", () => {
  const base = { statuses: [], severities: [], types: [], categories: [], siteIds: [], from: "", to: "" };

  it("matches everything when nothing is selected", () => {
    expect(matchesFilters(incident({}), base)).toBe(true);
  });

  it("combines multi-select values with OR inside a group and AND across groups", () => {
    const row = incident({ status: "open", severity: "high", categories: ["falls", "ppe"], category: "falls", siteId: "site-b" });
    expect(matchesFilters(row, { ...base, statuses: ["open", "resolved"], severities: ["high"] })).toBe(true);
    expect(matchesFilters(row, { ...base, statuses: ["resolved"] })).toBe(false);
    expect(matchesFilters(row, { ...base, categories: ["ppe"] })).toBe(true);
    expect(matchesFilters(row, { ...base, categories: ["chemical"] })).toBe(false);
    expect(matchesFilters(row, { ...base, siteIds: ["site-a"] })).toBe(false);
  });

  it("filters by Stockholm calendar dates", () => {
    const row = incident({ createdAt: "2026-10-10T23:30:00.000Z" }); // 11 Oct 01:30 in Stockholm
    expect(matchesFilters(row, { ...base, from: "2026-10-11", to: "" })).toBe(true);
    expect(matchesFilters(row, { ...base, from: "", to: "2026-10-10" })).toBe(false);
  });
});

describe("categories", () => {
  it("falls back to the single category for legacy rows", () => {
    expect(incidentCategories(incident({ category: "machine" }))).toEqual(["machine"]);
    expect(incidentCategories(incident({ category: "unclassified" }))).toEqual([]);
    expect(incidentCategories(incident({ category: "machine", categories: ["falls", "ppe"] }))).toEqual(["falls", "ppe"]);
  });

  it("keeps unknown database values as other, empty as unclassified", () => {
    expect(mapCategory("Laser cutting")).toBe("Laser cutting");
    expect(mapCategory("")).toBe("unclassified");
    expect(mapCategory("confined_space")).toBe("confined-space");
    expect(mapCategories(["falls", "unclassified", 3, "ppe"])).toEqual(["falls", "ppe"]);
  });

  it("maps the new report types", () => {
    expect(mapIncidentType("good-observation")).toBe("good-observation");
    expect(mapIncidentType("environmental_incident")).toBe("environmental");
  });
});

describe("deriveSeverity for positive observations", () => {
  it("needs no answers and is always low", () => {
    expect(deriveSeverity("positive-observation", { hurt: null, danger: null })).toBe("low");
    expect(deriveSeverity("good-observation", { hurt: true, danger: true })).toBe("low");
    expect(deriveSeverity("environmental", { hurt: null, danger: null })).toBeNull();
    expect(deriveSeverity("environmental", { hurt: false, danger: true })).toBe("high");
  });
});
