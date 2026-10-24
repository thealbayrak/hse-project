import { describe, expect, it } from "vitest";
import { createMockRepository } from "@/lib/data/mock-repository";
import { DEMO_WORKER_VIEWER, demoProfile } from "@/lib/demo/people";

async function view(personId: string | "worker") {
  const repo = createMockRepository();
  repo.setDemoViewer?.(personId === "worker" ? DEMO_WORKER_VIEWER : demoProfile(personId));
  return {
    repo,
    incidents: await repo.listIncidents(),
    sites: await repo.listSites(),
    tasks: await repo.listTasks(),
    people: await repo.listProfiles(),
  };
}

describe("demo viewer", () => {
  it("shows the owner every company", async () => {
    const owner = await view("p-owner");
    expect(new Set(owner.sites.map((site) => site.organizationId)).size).toBe(3);
    expect(owner.incidents.length).toBeGreaterThan(20);
  });

  it("keeps a manager inside their own company, across all its places", async () => {
    const lars = await view("p-lars");
    expect(lars.sites.map((site) => site.id).sort()).toEqual(["site-skovde", "site-torslanda"]);
    expect(lars.incidents.every((incident) => ["site-skovde", "site-torslanda"].includes(incident.siteId))).toBe(true);
    expect(lars.people.every((person) => person.organizationId === "org-volvo")).toBe(true);
  });

  it("shows a place-limited safety officer only their place", async () => {
    const eva = await view("p-eva");
    expect(eva.sites.map((site) => site.id)).toEqual(["site-torslanda"]);
    expect(eva.incidents.length).toBeGreaterThan(0);
    expect(eva.incidents.every((incident) => incident.siteId === "site-torslanda")).toBe(true);
  });

  it("shows an action owner only what is assigned to them", async () => {
    const maria = await view("p-maria");
    expect(maria.incidents.map((incident) => incident.reference)).toEqual(["SS-2026-0207"]);
    expect(maria.tasks.every((task) => task.assigneeId === "p-maria")).toBe(true);
  });

  it("gives a worker no data, only the public list of places for the QR form", async () => {
    const worker = await view("worker");
    expect(worker.incidents).toEqual([]);
    expect(worker.tasks).toEqual([]);
    expect(worker.sites.length).toBeGreaterThanOrEqual(4);
  });
});
