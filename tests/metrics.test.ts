import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeMetrics, sortIncidents } from "@/lib/data/metrics";
import type { Incident } from "@/lib/types";

function incident(overrides: Partial<Incident>): Incident {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    reference: "SS-2026-0001",
    type: "hazard",
    siteId: "site",
    locationId: "loc",
    category: "machine",
    severity: "low",
    description: "x",
    mediaUrls: [],
    anonymous: false,
    reporterName: "Site worker",
    status: "open",
    createdAt: "2026-09-01T00:00:00.000Z",
    capa: null,
    ...overrides,
  };
}

describe("computeMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("counts open actions and unresolved critical near-misses", () => {
    const metrics = computeMetrics([
      incident({ status: "open" }),
      incident({ status: "in-progress", type: "near-miss", severity: "critical" }),
      incident({ status: "resolved", type: "near-miss", severity: "critical" }),
      incident({ status: "resolved" }),
    ]);
    expect(metrics.totalReports).toBe(4);
    expect(metrics.openActions).toBe(2);
    expect(metrics.criticalNearMisses).toBe(1);
  });

  it("measures days since the latest accident, defaulting to 90 without one", () => {
    expect(computeMetrics([]).daysIncidentFree).toBe(90);
    const metrics = computeMetrics([
      incident({ type: "accident", createdAt: "2026-10-01T00:00:00.000Z" }),
      incident({ type: "accident", createdAt: "2026-10-10T06:00:00.000Z" }),
    ]);
    expect(metrics.daysIncidentFree).toBe(6);
  });

  it("never reports negative days for a clock skew", () => {
    const metrics = computeMetrics([incident({ type: "accident", createdAt: "2026-10-17T00:00:00.000Z" })]);
    expect(metrics.daysIncidentFree).toBe(0);
  });
});

describe("sortIncidents", () => {
  it("sorts newest first without mutating the input", () => {
    const older = incident({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = incident({ id: "new", createdAt: "2026-02-01T00:00:00.000Z" });
    const input = [older, newer];
    expect(sortIncidents(input).map((item) => item.id)).toEqual(["new", "old"]);
    expect(input[0].id).toBe("old");
  });
});
