import { describe, expect, it } from "vitest";
import { createMockRepository } from "@/lib/data/mock-repository";
import { mapAuditItems, mapAuditStatus, mapChecklistItems } from "@/lib/supabase/mappers";

describe("checklist mappers", () => {
  it("drops malformed items and defaults keys", () => {
    expect(mapChecklistItems([{ title: "Caps fitted" }, { title: "" }, "x", { key: "k", title: "Hoses ok", hint: "look" }])).toEqual([
      { key: "item-1", title: "Caps fitted", hint: undefined },
      { key: "k", title: "Hoses ok", hint: "look" },
    ]);
  });

  it("maps answers and statuses safely", () => {
    const items = mapAuditItems([{ key: "a", title: "A", status: "fail", note: "broken", dueDate: "2026-11-01", incidentId: "inc-1" }, { key: "b", title: "B", status: "weird" }]);
    expect(items[0]).toMatchObject({ status: "fail", note: "broken", dueDate: "2026-11-01", incidentId: "inc-1" });
    expect(items[1]).toMatchObject({ status: null, note: "", dueDate: null, incidentId: null });
    expect(mapAuditStatus("in_progress")).toBe("in-progress");
    expect(mapAuditStatus("completed")).toBe("done");
    expect(mapAuditStatus("nonsense")).toBe("assigned");
  });
});

describe("audit flow (mock repository)", () => {
  it("raises a hazard per failed item and refuses to close while one is open", async () => {
    const repo = createMockRepository();
    const [template] = await repo.listTemplates();
    const audit = await repo.createAudit({ templateId: template.id, siteId: "site-kvillebacken", assigneeId: "p-johan", dueDate: "2026-11-01" }, "p-erik");
    expect(audit.status).toBe("assigned");
    expect(audit.items).toHaveLength(template.items.length);

    const answered = audit.items.map((item, index) => ({
      ...item,
      status: index === 0 ? ("fail" as const) : ("ok" as const),
      note: index === 0 ? "Chain missing on two cylinders" : "",
      dueDate: index === 0 ? "2026-10-25" : null,
      assigneeId: index === 0 ? "p-johan" : null,
    }));
    const submitted = await repo.updateAudit(audit.id, { items: answered, status: "submitted" });
    expect(submitted.status).toBe("submitted");
    expect(submitted.openNonConformities).toBe(1);
    const failed = submitted.items[0];
    expect(failed.incidentId).toBeTruthy();
    expect(failed.incidentReference).toMatch(/^SS-\d{4}-\d{4}$/);

    const incidents = await repo.listIncidents();
    const hazard = incidents.find((incident) => incident.id === failed.incidentId)!;
    expect(hazard).toMatchObject({ type: "hazard", source: "audit", auditId: audit.id, status: "open" });
    expect(hazard.capa).toMatchObject({ assigneeName: "Johan Ek", dueDate: "2026-10-25" });

    await expect(repo.updateAudit(audit.id, { status: "done" })).rejects.toThrow("AUDIT_OPEN_NONCONFORMITIES");

    await repo.updateCapa(hazard.id, { assigneeId: "off-johan", assigneeName: "Johan Ek", dueDate: "2026-10-25", status: "resolved", notes: "Chains fitted" });
    const closed = await repo.updateAudit(audit.id, { status: "done" });
    expect(closed.status).toBe("done");
    expect(closed.completedAt).toBeTruthy();
  });

  it("stores several areas and risk types on a report, with unclassified as the empty state", async () => {
    const repo = createMockRepository();
    const created = await repo.createIncident({
      type: "near-miss",
      siteId: "site-kvillebacken",
      locationId: "",
      locationIds: [],
      category: "unclassified",
      categories: [],
      severity: "medium",
      description: "Pallet nearly fell off the forks.",
      mediaUrls: [],
      anonymous: true,
      reporterName: null,
    });
    expect(created.category).toBe("unclassified");
    expect(created.categories).toEqual([]);
    expect(created.locationName).toBe(created.siteName);

    const classified = await repo.updateCapa(created.id, {
      assigneeId: "off-erik",
      assigneeName: "Erik",
      dueDate: "2026-10-30",
      status: "in-progress",
      notes: "",
      categories: ["falling-objects", "machine"],
    });
    expect(classified.category).toBe("falling-objects");
    expect(classified.categories).toEqual(["falling-objects", "machine"]);
  });
});
