import { describe, expect, it } from "vitest";
import { isOverdue, isUnownedCritical, isWalkStale } from "@/components/dashboard/dashboard-view";
import { localeFromBrowser, translate, translations } from "@/lib/i18n/translations";
import { deriveSeverity } from "@/lib/report/severity";
import type { Incident } from "@/lib/types";

const base: Incident = {
  id: "1",
  reference: "SS-2026-0001",
  type: "near-miss",
  siteId: "s",
  locationId: "l",
  category: "falls",
  severity: "critical",
  description: "x",
  mediaUrls: [],
  anonymous: false,
  reporterName: null,
  status: "open",
  createdAt: "2026-10-01T00:00:00.000Z",
  capa: null,
};

describe("deriveSeverity", () => {
  it("needs both answers", () => {
    expect(deriveSeverity("near-miss", { hurt: null, danger: true })).toBeNull();
  });

  it("maps the two questions to a level", () => {
    expect(deriveSeverity("accident", { hurt: true, danger: true })).toBe("critical");
    expect(deriveSeverity("accident", { hurt: true, danger: false })).toBe("high");
    expect(deriveSeverity("near-miss", { hurt: false, danger: true })).toBe("high");
    expect(deriveSeverity("near-miss", { hurt: false, danger: false })).toBe("medium");
    expect(deriveSeverity("hazard", { hurt: false, danger: false })).toBe("low");
  });
});

describe("dashboard attention rules", () => {
  it("flags overdue CAPA due dates in Stockholm time", () => {
    const capa = { assigneeId: "a", assigneeName: "Anna", dueDate: "2026-10-10", status: "open" as const, notes: "", updatedAt: "" };
    expect(isOverdue({ ...base, capa }, "2026-10-11")).toBe(true);
    expect(isOverdue({ ...base, capa }, "2026-10-10")).toBe(false);
    expect(isOverdue({ ...base, capa, status: "resolved" }, "2026-10-11")).toBe(false);
    expect(isOverdue(base, "2026-10-11")).toBe(false);
  });

  it("flags critical reports nobody owns", () => {
    expect(isUnownedCritical(base)).toBe(true);
    expect(isUnownedCritical({ ...base, severity: "high" })).toBe(false);
    expect(isUnownedCritical({ ...base, capa: { assigneeId: "a", assigneeName: "Anna", dueDate: "", status: "open", notes: "", updatedAt: "" } })).toBe(false);
  });

  it("asks for a walk after seven days", () => {
    const now = new Date("2026-10-16T12:00:00Z").getTime();
    const walk = { id: "w", title: "", siteId: "s", skyddsombudName: "", skyddsombudRole: "", completedAt: "2026-10-12T12:00:00Z", deviationCount: 0, activeDeviations: 0, resolvedDeviations: 0 };
    expect(isWalkStale(null, now)).toBe(true);
    expect(isWalkStale(walk, now)).toBe(false);
    expect(isWalkStale({ ...walk, completedAt: "2026-10-01T12:00:00Z" }, now)).toBe(true);
  });
});

describe("i18n", () => {
  it("defaults to Swedish and honours English and Turkish", () => {
    expect(localeFromBrowser("tr-TR,tr;q=0.9,en-US;q=0.8")).toBe("tr");
    expect(localeFromBrowser("en-US,en;q=0.9")).toBe("en");
    expect(localeFromBrowser("sv-SE")).toBe("sv");
    expect(localeFromBrowser("de-DE")).toBe("sv");
    expect(localeFromBrowser("")).toBe("sv");
  });

  it("has every English key in Swedish and Turkish", () => {
    for (const [group, fields] of Object.entries(translations.en)) {
      for (const key of Object.keys(fields)) {
        expect((translations.sv as Record<string, Record<string, string>>)[group]?.[key], `sv ${group}.${key}`).toBeTypeOf("string");
        expect((translations.tr as Record<string, Record<string, string>>)[group]?.[key], `tr ${group}.${key}`).toBeTypeOf("string");
      }
    }
  });

  it("interpolates variables and falls back to English", () => {
    expect(translate("tr", "dashboard.overdue", { n: 3 })).toBe("3 vadesi geçmiş aksiyon");
    expect(translate("sv", "nope.missing")).toBe("nope.missing");
  });
});
