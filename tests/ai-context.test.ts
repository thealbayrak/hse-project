import { describe, expect, it } from "vitest";
import { compactIncidents, incidentStats } from "@/lib/ai/context";
import { categoryLabel, placeLabel, typeLabel } from "@/lib/format";
import type { Incident } from "@/lib/types";

function incident(overrides: Partial<Incident>): Incident {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    reference: "SS-2026-0001",
    type: "hazard",
    siteId: "s",
    siteName: "Plant A",
    locationId: "",
    category: "unclassified",
    severity: "medium",
    description: "Oil on the floor near the press",
    mediaUrls: [],
    anonymous: false,
    reporterName: "Ali",
    status: "open",
    createdAt: "2026-10-10T10:00:00.000Z",
    capa: null,
    ...overrides,
  };
}

describe("labels for open lists", () => {
  it("shows a company's own risk type as written and translates built-in ones", () => {
    expect(categoryLabel("Glass breakage", "tr")).toBe("Glass breakage");
    expect(categoryLabel("falls", "en")).toBe("Falls from height");
  });

  it("uses the typed type for other", () => {
    expect(typeLabel("other", "en", "Broken pallet")).toBe("Broken pallet");
    expect(typeLabel("other", "en")).toBe("Other");
  });

  it("builds the place from area, site and typed note", () => {
    expect(placeLabel(incident({ locationName: "Line 2", locationNote: "next to the door" }))).toBe("Line 2 · Plant A · next to the door");
    expect(placeLabel(incident({ siteId: "", siteName: undefined, locationNote: "canteen" }))).toBe("canteen");
    expect(placeLabel(incident({ siteId: "", siteName: undefined }))).toBe("—");
  });
});

describe("assistant context", () => {
  it("keeps the newest reports, trims text and flags overdue actions", () => {
    const rows = compactIncidents(
      [
        incident({ reference: "SS-1", createdAt: "2026-10-01T10:00:00.000Z", description: "x".repeat(400) }),
        incident({
          reference: "SS-2",
          createdAt: "2026-10-12T10:00:00.000Z",
          categories: ["falls"],
          category: "falls",
          capa: { assigneeId: "a", assigneeName: "Erik", dueDate: "2026-10-15", status: "open", notes: "", updatedAt: "" },
        }),
      ],
      "2026-10-20"
    );
    expect(rows.map((row) => row.ref)).toEqual(["SS-2", "SS-1"]);
    expect(rows[1].text.length).toBeLessThanOrEqual(241);
    expect(rows[0]).toMatchObject({ owner: "Erik", overdue: true, risks: "Falls from height" });
  });

  it("counts exactly", () => {
    const stats = incidentStats(
      compactIncidents([
        incident({ severity: "critical", categories: ["falls", "ppe"], category: "falls" }),
        incident({ anonymous: true }),
      ])
    );
    expect(stats).toMatchObject({ total: 2, unclassified: 1, anonymous: 1 });
    expect(stats.bySeverity).toEqual({ critical: 1, medium: 1 });
    expect(stats.byRisk).toEqual({ "Falls from height": 1, PPE: 1 });
  });
});
