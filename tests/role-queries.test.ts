import { describe, expect, it } from "vitest";
import { createMockRepository } from "@/lib/data/mock-repository";
import { DEMO_WORKER_VIEWER, demoProfile } from "@/lib/demo/people";
import { actionsFor, adminOverview, awaitingVerification, investigationsFor, needsActionOwner, verifiedBy } from "@/lib/roles/queries";

async function viewAs(personId: string) {
  const repo = createMockRepository();
  repo.setDemoViewer?.(demoProfile(personId));
  return { repo, incidents: await repo.listIncidents() };
}

describe("what each role sees", () => {
  it("shows an area responsible only the reports of their areas, and the ones to assign", async () => {
    const { incidents } = await viewAs("p-karin");
    expect(incidents.length).toBeGreaterThan(0);
    expect(incidents.every((incident) => ["loc-zone-3", "loc-roof-4", "loc-ground"].some((id) => incident.locationIds?.includes(id) || incident.locationId === id))).toBe(true);
    expect(incidents.filter(needsActionOwner).length).toBeGreaterThan(0);
  });

  it("shows an action owner their repairs", async () => {
    const { incidents } = await viewAs("p-maria");
    expect(actionsFor(incidents, "p-maria").map((incident) => incident.reference)).toEqual(["SS-2026-0207"]);
  });

  it("shows an investigator the reports they were named on, and a manager every required one", async () => {
    const henrik = await viewAs("p-henrik");
    const mine = investigationsFor(henrik.incidents, "p-henrik", false);
    expect(mine.map((incident) => incident.reference).sort()).toEqual(["SS-2026-0207", "SS-2026-0209"]);

    const anna = await viewAs("p-anna");
    expect(investigationsFor(anna.incidents, "p-anna", true).length).toBeGreaterThanOrEqual(mine.length);
  });

  it("shows the follow-up person finished actions to check", async () => {
    const ingrid = await viewAs("p-ingrid");
    expect(awaitingVerification(ingrid.incidents, "p-ingrid", false).map((incident) => incident.reference)).toEqual(["SS-2026-0210"]);
  });
});

describe("the assignment workflow (demo repository)", () => {
  it("lets an area responsible assign people, locks them once a manager changes them, and the manager can override", async () => {
    const karin = await viewAs("p-karin");
    const target = karin.incidents.find((incident) => incident.reference === "SS-2026-0206");
    expect(target).toBeTruthy();

    const assigned = await karin.repo.assignIncident({
      incidentId: target!.id,
      actionOwnerId: "p-maria",
      investigatorId: "p-henrik",
      followUpId: "p-ingrid",
      investigationRequired: true,
      investigationDueDate: "2026-11-30",
      actionDueDate: "2026-11-10",
    });
    expect(assigned.assignment).toMatchObject({ actionOwnerName: "Maria Holm", investigatorName: "Henrik Sund", followUpName: "Ingrid Moberg", areaResponsibleName: "Karin Dahl", managerLocked: false });
    expect(assigned.status).toBe("in-progress");
    expect(assigned.capa?.assigneeId).toBe("p-maria");

    // A manager overrides; from then on the area responsible is locked out.
    karin.repo.setDemoViewer?.(demoProfile("p-anna"));
    const overridden = await karin.repo.assignIncident({
      incidentId: target!.id,
      actionOwnerId: "p-johan",
      investigatorId: "p-henrik",
      followUpId: "p-ingrid",
      investigationRequired: true,
      investigationDueDate: "2026-11-30",
      actionDueDate: "2026-11-10",
    });
    expect(overridden.assignment).toMatchObject({ actionOwnerName: "Johan Ek", managerLocked: true });

    karin.repo.setDemoViewer?.(demoProfile("p-karin"));
    await expect(
      karin.repo.assignIncident({ incidentId: target!.id, actionOwnerId: "p-maria", investigatorId: null, followUpId: null, investigationRequired: false, investigationDueDate: null, actionDueDate: null })
    ).rejects.toThrow(/manager/);
  });

  it("asks the follow-up person to check a finished action, and sends it back with a reason", async () => {
    const anna = await viewAs("p-anna");
    const target = anna.incidents.find((incident) => incident.reference === "SS-2026-0207")!;
    const done = await anna.repo.updateCapa(target.id, {
      assigneeId: "p-maria",
      assigneeName: "Maria Holm",
      dueDate: "2026-11-01",
      status: "resolved",
      notes: "Wheel chocks fitted.",
    });
    expect(done.assignment?.followUpStatus).toBe("pending");

    await expect(anna.repo.verifyFollowUp({ incidentId: target.id, approved: false, note: "" })).rejects.toThrow();
    const sentBack = await anna.repo.verifyFollowUp({ incidentId: target.id, approved: false, note: "Two chocks are still missing." });
    expect(sentBack.status).toBe("in-progress");
    expect(sentBack.assignment).toMatchObject({ followUpStatus: "rejected", followUpNote: "Two chocks are still missing." });
    expect(verifiedBy([sentBack], "p-ingrid", true)).toHaveLength(1);

    const approved = await anna.repo.verifyFollowUp({ incidentId: target.id, approved: true, note: "" });
    expect(approved.assignment?.followUpStatus).toBe("approved");
  });

  it("stores an investigation and counts what the manager overview shows", async () => {
    const anna = await viewAs("p-anna");
    const target = anna.incidents.find((incident) => incident.reference === "SS-2026-0209")!;
    const saved = await anna.repo.saveInvestigation({ incidentId: target.id, status: "done", rootCause: "Damaged cable in the cabin board.", notes: "Board replaced." });
    expect(saved.assignment).toMatchObject({ investigationStatus: "done", rootCause: "Damaged cable in the cabin board." });
    expect(saved.assignment?.investigationCompletedAt).toBeTruthy();

    const counts = adminOverview(await anna.repo.listIncidents(), "2026-10-30");
    expect(counts.unassigned).toBeGreaterThanOrEqual(1);
  });

  it("gives a worker nothing", async () => {
    const repo = createMockRepository();
    repo.setDemoViewer?.(DEMO_WORKER_VIEWER);
    expect(await repo.listIncidents()).toEqual([]);
  });
});
