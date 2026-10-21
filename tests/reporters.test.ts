import { describe, expect, it } from "vitest";
import { reporterStats } from "@/lib/dashboard/reporters";
import { landingFor } from "@/lib/auth/landing";
import type { Incident } from "@/lib/types";

function report(overrides: Partial<Incident>): Incident {
  return {
    id: Math.random().toString(36).slice(2),
    reference: "SS-1",
    type: "hazard",
    siteId: "s1",
    locationId: "",
    category: "unclassified",
    severity: "medium",
    description: "x",
    mediaUrls: [],
    anonymous: true,
    reporterName: null,
    status: "open",
    createdAt: "2026-10-20T08:00:00.000Z",
    capa: null,
    source: "report",
    ...overrides,
  } as Incident;
}

describe("who reports", () => {
  it("counts each named person, groups the anonymous ones last and keeps severity per person", () => {
    const rows = reporterStats([
      report({ anonymous: false, reporterName: "Ali", reporterProfileId: "p-ali", severity: "high" }),
      report({ anonymous: false, reporterName: "Ali", reporterProfileId: "p-ali", severity: "low", createdAt: "2026-10-21T08:00:00.000Z" }),
      report({ anonymous: false, reporterName: "Eva Typed", severity: "critical" }),
      report({ anonymous: true }),
      report({ anonymous: true }),
      report({ anonymous: true }),
    ]);
    expect(rows.map((row) => [row.name, row.count])).toEqual([
      ["Ali", 2],
      ["Eva Typed", 1],
      [null, 3],
    ]);
    expect(rows[0].severity).toMatchObject({ high: 1, low: 1, critical: 0 });
    expect(rows[0].lastAt).toBe("2026-10-21T08:00:00.000Z");
  });

  it("treats a report without a name as anonymous even when the flag is off", () => {
    const rows = reporterStats([report({ anonymous: false, reporterName: "  " })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBeNull();
  });
});

describe("landing page by role", () => {
  it("sends each role to the page that fits", () => {
    expect(landingFor("super_admin")).toBe("/projects");
    expect(landingFor("hse_manager")).toBe("/dashboard");
    expect(landingFor("safety_officer")).toBe("/dashboard");
    expect(landingFor("action_owner")).toBe("/tasks");
    expect(landingFor("worker")).toBe("/");
    expect(landingFor(null)).toBe("/");
  });
});
