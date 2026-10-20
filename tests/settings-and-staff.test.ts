import { describe, expect, it } from "vitest";
import { assignableRoles, checkStaffRequest } from "@/lib/admin/staff-rules";
import { can } from "@/lib/auth/permissions";
import { createMockRepository } from "@/lib/data/mock-repository";

describe("who may add whom", () => {
  it("lets managers add field staff only, and the owner anyone", () => {
    expect(assignableRoles("hse_manager")).toEqual(["worker", "foreman", "safety_officer"]);
    expect(assignableRoles("super_admin")).toContain("hse_manager");
    expect(assignableRoles("safety_officer")).toEqual([]);
  });

  it("keeps managers inside their own company", () => {
    const manager = { role: "hse_manager" as const, organizationId: "org-a" };
    expect(checkStaffRequest({ fullName: "Ali", role: "worker" }, manager)).toMatchObject({ ok: true, organizationId: "org-a" });
    expect(checkStaffRequest({ fullName: "Ali", role: "worker", organizationId: "org-b" }, manager)).toMatchObject({ ok: false, status: 403 });
    expect(checkStaffRequest({ fullName: "Boss", role: "hse_manager" }, manager)).toMatchObject({ ok: false, status: 403 });
  });

  it("checks login details", () => {
    const owner = { role: "super_admin" as const, organizationId: null };
    expect(checkStaffRequest({ fullName: "Eva", role: "hse_manager" }, owner)).toMatchObject({ ok: false, error: "Choose the company." });
    expect(checkStaffRequest({ fullName: "Eva", role: "hse_manager", organizationId: "o", password: "longenough" }, owner)).toMatchObject({ ok: false });
    expect(checkStaffRequest({ fullName: "Eva", role: "hse_manager", organizationId: "o", email: "eva@x.se", password: "short" }, owner)).toMatchObject({ ok: false });
    expect(checkStaffRequest({ fullName: "Eva", role: "hse_manager", organizationId: "o", email: "EVA@x.se ", password: "longenough" }, owner)).toEqual({
      ok: true,
      organizationId: "o",
      email: "eva@x.se",
      password: "longenough",
    });
  });

  it("gives company settings to managers and companies to the owner only", () => {
    expect(can("hse_manager", "settings.manage")).toBe(true);
    expect(can("hse_manager", "projects.manage")).toBe(false);
    expect(can("super_admin", "projects.manage")).toBe(true);
    expect(can("worker", "dashboard.view")).toBe(false);
  });
});

describe("company settings (mock repository)", () => {
  it("adds a company, a place, areas and its own risk types", async () => {
    const repo = createMockRepository();
    const company = await repo.createOrganization({ name: "Bottle Works AB", industry: "Glass" });
    const site = await repo.createSite({ organizationId: company.id, name: "Bottle plant Malmö", city: "Malmö" });
    expect(site).toMatchObject({ organizationId: company.id, organizationName: "Bottle Works AB", locations: [] });
    await repo.createLocation(site.id, "Filling line 2");
    const sites = await repo.listSites();
    expect(sites.find((item) => item.id === site.id)?.locations.map((item) => item.name)).toEqual(["Filling line 2"]);

    await repo.createRiskType(company.id, "Glass breakage");
    await expect(repo.createRiskType(company.id, "glass breakage")).rejects.toThrow();
    expect((await repo.listRiskTypes(company.id)).map((item) => item.label)).toEqual(["Glass breakage"]);
  });

  it("adds staff who then appear for task assignment and the reporter list", async () => {
    const repo = createMockRepository();
    const result = await repo.createStaff({ fullName: "Mira Berg", role: "foreman", organizationId: "org-volvo", email: "mira@x.se", password: "longenough" });
    expect(result.login).toBe("created");
    expect((await repo.listProfiles()).some((person) => person.id === result.profile.id)).toBe(true);
    expect((await repo.listOrgPeople("org-volvo")).map((person) => person.fullName)).toContain("Mira Berg");
    await expect(repo.createStaff({ fullName: "Copy", role: "worker", organizationId: "org-volvo", email: "MIRA@x.se" })).rejects.toThrow();
  });

  it("accepts a report with only a description, tied to the company from the QR code", async () => {
    const repo = createMockRepository();
    const created = await repo.createIncident({
      type: "other",
      typeNote: "Broken pallet",
      siteId: "",
      organizationId: "org-volvo",
      locationNote: "Behind the canteen",
      locationId: "",
      category: "unclassified",
      categories: ["Truck / forklift"],
      severity: "medium",
      description: "Pallet with broken boards left in the walkway.",
      mediaUrls: [],
      anonymous: true,
      reporterName: null,
    });
    expect(created).toMatchObject({
      siteId: "",
      organizationId: "org-volvo",
      locationNote: "Behind the canteen",
      typeNote: "Broken pallet",
      categories: ["Truck / forklift"],
    });
  });
});
