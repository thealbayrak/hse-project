import { describe, expect, it } from "vitest";
import { createMockRepository, nextReference } from "@/lib/data/mock-repository";
import { SKYDDSROND_ITEMS } from "@/lib/skyddsrond/checklist";

describe("nextReference", () => {
  it("continues the highest existing number for the year", () => {
    expect(nextReference([{ reference: "SS-2026-0196" }, { reference: "SS-2026-0007" }], 2026)).toBe("SS-2026-0197");
    expect(nextReference([], 2027)).toBe("SS-2027-0001");
  });
});

describe("createMockRepository", () => {
  it("creates incidents with place names and updates CAPA", async () => {
    const repo = createMockRepository();
    const before = await repo.listIncidents();

    const created = await repo.createIncident({
      type: "hazard",
      siteId: "site-malmo",
      locationId: "loc-chem",
      category: "chemical",
      severity: "high",
      description: "Leaking drum in the chemical store.",
      mediaUrls: [],
      anonymous: true,
      reporterName: "Site worker",
    });

    expect(created.reference).toMatch(/^SS-\d{4}-\d{4}$/);
    expect(created.siteName).toBe("Malmö Component Works");
    expect(created.locationName).toBe("Chemical Store");
    expect(created.reporterName).toBeNull();
    expect((await repo.listIncidents()).length).toBe(before.length + 1);

    const updated = await repo.updateCapa(created.id, {
      assigneeId: "off-anna",
      assigneeName: "Anna Bergström",
      dueDate: "2026-10-20",
      status: "in-progress",
      notes: "Drum moved to bund.",
    });
    expect(updated.status).toBe("in-progress");
    expect(updated.capa?.assigneeName).toBe("Anna Bergström");
    expect((await repo.getIncident(created.id))?.capa?.notes).toBe("Drum moved to bund.");
  });

  it("records a skyddsrond and marks deviations as pending actions", async () => {
    const repo = createMockRepository();
    const walk = await repo.createSafetyWalk({
      title: "Test walk",
      siteId: "site-torslanda",
      skyddsombudName: "Maria Holm",
      skyddsombudRole: "Skyddsombud",
      items: SKYDDSROND_ITEMS.map((item, index) => ({
        itemKey: item.key,
        domain: item.domain,
        title: item.title,
        status: index === 0 ? "deviation" : "ok",
        notes: index === 0 ? "Missing guardrail" : "",
        sortOrder: index,
      })),
    });
    expect(walk.items[0].actionStatus).toBe("pending");
    expect(walk.items[1].actionStatus).toBeNull();
    const latest = await repo.getLatestSafetyWalk();
    expect(latest?.id).toBe(walk.id);
    expect(latest?.activeDeviations).toBe(1);
  });
});
