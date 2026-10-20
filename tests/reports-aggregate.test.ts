import { describe, expect, it } from "vitest";
import { badgeFor, inPeriod, periodFor, summarize, trendBuckets } from "@/lib/reports/aggregate";
import type { Incident } from "@/lib/types";

function incident(overrides: Partial<Incident>): Incident {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    reference: "SS-2026-0001",
    type: "hazard",
    siteId: "site-a",
    siteName: "Site A",
    locationId: "loc",
    category: "machine",
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

describe("periodFor", () => {
  const now = new Date("2026-10-14T23:30:00.000Z"); // Thursday 15 Oct 01:30 in Stockholm (CEST)

  it("uses the Stockholm calendar day", () => {
    expect(periodFor("today", now)).toEqual({ from: "2026-10-15", to: "2026-10-15" });
  });

  it("starts the week on Monday", () => {
    expect(periodFor("week", now)).toEqual({ from: "2026-10-12", to: "2026-10-15" });
  });

  it("starts month and year on the first day", () => {
    expect(periodFor("month", now)).toEqual({ from: "2026-10-01", to: "2026-10-15" });
    expect(periodFor("year", now)).toEqual({ from: "2026-01-01", to: "2026-10-15" });
  });

  it("checks membership inclusively", () => {
    const period = { from: "2026-10-01", to: "2026-10-15" };
    expect(inPeriod("2026-10-15T21:59:00.000Z", period)).toBe(true);
    expect(inPeriod("2026-10-15T22:30:00.000Z", period)).toBe(false); // already 16 Oct in Stockholm
    expect(inPeriod("2026-09-30T21:00:00.000Z", period)).toBe(false);
  });
});

describe("summarize", () => {
  const period = { from: "2026-10-01", to: "2026-10-31" };

  it("counts by type, severity, site and resolution", () => {
    const summary = summarize(
      [
        incident({ id: "1", type: "accident", severity: "critical" }),
        incident({ id: "2", type: "near-miss", severity: "medium", status: "resolved", capa: { assigneeId: "a", assigneeName: "A", status: "resolved", dueDate: "2026-10-12", notes: "", updatedAt: "2026-10-11T10:00:00.000Z" } }),
        incident({ id: "3", siteId: "site-b", siteName: "Site B", capa: { assigneeId: "a", assigneeName: "A", status: "open", dueDate: "2026-10-01", notes: "", updatedAt: "2026-10-02T10:00:00.000Z" } }),
        incident({ id: "4", createdAt: "2026-09-20T10:00:00.000Z" }), // outside the period
      ],
      period,
      "2026-10-20"
    );
    expect(summary.total).toBe(3);
    expect(summary.byType).toMatchObject({ "near-miss": 1, hazard: 1, accident: 1, environmental: 0 });
    expect(summary.bySeverity.critical).toBe(1);
    expect(summary.resolved).toBe(1);
    expect(summary.resolutionRate).toBeCloseTo(1 / 3);
    expect(summary.medianCloseHours).toBe(24);
    expect(summary.overdueActions).toBe(1);
    expect(summary.bySite[0]).toMatchObject({ siteId: "site-a", count: 2, critical: 1, resolved: 1 });
  });

  it("ranks reporters and leaves anonymous ones out", () => {
    const summary = summarize(
      [
        incident({ id: "1", reporterProfileId: "p1", reporterName: "Ali" }),
        incident({ id: "2", reporterProfileId: "p1", reporterName: "Ali" }),
        incident({ id: "3", reporterProfileId: "p1", reporterName: "Ali", severity: "critical" }),
        incident({ id: "4", reporterProfileId: "p2", reporterName: "Piotr" }),
        incident({ id: "5", anonymous: true, reporterName: null }),
      ],
      period
    );
    expect(summary.anonymous).toBe(1);
    expect(summary.reporters.map((r) => [r.name, r.count, r.badge])).toEqual([
      ["Ali", 3, "silver"],
      ["Piotr", 1, "bronze"],
    ]);
  });

  it("awards badges by count", () => {
    expect(badgeFor(0)).toBeNull();
    expect(badgeFor(1)).toBe("bronze");
    expect(badgeFor(3)).toBe("silver");
    expect(badgeFor(5)).toBe("gold");
  });
});

describe("trendBuckets", () => {
  it("fills every day of a short period", () => {
    const summary = summarize([incident({ createdAt: "2026-10-03T10:00:00.000Z" })], { from: "2026-10-01", to: "2026-10-05" });
    const buckets = trendBuckets(summary);
    expect(buckets).toHaveLength(5);
    expect(buckets[2]).toEqual({ label: "10-03", count: 1, critical: 0 });
  });

  it("groups long periods by week", () => {
    const summary = summarize([incident({ createdAt: "2026-01-10T10:00:00.000Z", severity: "critical" })], { from: "2026-01-01", to: "2026-03-31" });
    const buckets = trendBuckets(summary);
    expect(buckets).toHaveLength(13);
    expect(buckets[1]).toMatchObject({ count: 1, critical: 1 });
  });
});
