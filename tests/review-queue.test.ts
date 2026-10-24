import { describe, expect, it } from "vitest";
import { buildAssignmentEmail } from "@/lib/alerts/assignment-email";
import { buildWorkEmail } from "@/lib/alerts/work-email";
import { assignableRoles } from "@/lib/admin/staff-rules";
import { can } from "@/lib/auth/permissions";
import { createMockRepository } from "@/lib/data/mock-repository";
import { averageResolutionDays, incidentsBySubcontractor, isPendingReview, severityDistribution } from "@/lib/dashboard/kpis";
import { companyBaseUrl, isValidSlug, reportUrl, slugFromHost, slugify } from "@/lib/qr/urls";
import { suggestSeverity } from "@/lib/report/severity";
import { mapRole, mapSeverity } from "@/lib/supabase/mappers";
import type { Incident } from "@/lib/types";

function incident(overrides: Partial<Incident>): Incident {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    reference: "SS-2026-0001",
    type: "hazard",
    siteId: "s",
    locationId: "",
    category: "unclassified",
    severity: "unrated",
    description: "Oil on the floor",
    mediaUrls: [],
    anonymous: false,
    reporterName: "Ali",
    status: "open",
    createdAt: "2026-10-10T10:00:00.000Z",
    capa: null,
    ...overrides,
  };
}

describe("severity is rated by a manager", () => {
  it("maps unknown values to pending review, not to medium", () => {
    expect(mapSeverity("unrated")).toBe("unrated");
    expect(mapSeverity("whatever")).toBe("unrated");
    expect(mapSeverity("HIGH")).toBe("high");
  });

  it("only suggests a level from the reporter's answers", () => {
    expect(suggestSeverity("accident", { hurt: true, danger: true })).toBe("critical");
    expect(suggestSeverity("hazard", { hurt: false, danger: true })).toBe("high");
    expect(suggestSeverity("hazard", { hurt: null, danger: null })).toBeNull();
    expect(suggestSeverity("hazard", { hurt: false, danger: null })).toBe("low");
    expect(suggestSeverity("good-observation", { hurt: true, danger: true })).toBeNull();
  });

  it("counts reports that wait for a rating, praise excluded", () => {
    expect(isPendingReview(incident({}))).toBe(true);
    expect(isPendingReview(incident({ severity: "high" }))).toBe(false);
    expect(isPendingReview(incident({ type: "positive-observation" }))).toBe(false);
    expect(isPendingReview(incident({ status: "resolved" }))).toBe(false);
  });

  it("keeps what the reporter said and starts unrated (mock repository)", async () => {
    const repo = createMockRepository();
    const created = await repo.createIncident({
      type: "hazard",
      siteId: "",
      organizationId: "org-volvo",
      locationId: "",
      category: "unclassified",
      severity: "unrated",
      hurt: true,
      dangerPresent: true,
      subcontractor: "Acme Installations AB",
      description: "Broken guard rail on the stairs.",
      mediaUrls: [],
      anonymous: true,
      reporterName: null,
    });
    expect(created).toMatchObject({ severity: "unrated", hurt: true, dangerPresent: true, subcontractor: "Acme Installations AB" });
    const rated = await repo.updateCapa(created.id, {
      assigneeId: "p-erik",
      assigneeName: "Erik Lindqvist",
      dueDate: "2026-11-01",
      status: "open",
      notes: "",
      severity: "high",
    });
    expect(rated.severity).toBe("high");
  });
});

describe("dashboard figures", () => {
  it("averages the days to resolve, ignoring open reports", () => {
    const resolved = (days: number) =>
      incident({
        status: "resolved",
        createdAt: "2026-10-01T00:00:00.000Z",
        capa: { assigneeId: "a", assigneeName: "A", dueDate: "", status: "resolved", notes: "", updatedAt: new Date(Date.UTC(2026, 9, 1 + days)).toISOString() },
      });
    expect(averageResolutionDays([resolved(2), resolved(5), incident({})])).toBe(3.5);
    expect(averageResolutionDays([incident({})])).toBeNull();
  });

  it("groups by subcontractor, largest first, with the tail folded", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => incident({ subcontractor: "B" })),
      ...Array.from({ length: 2 }, () => incident({ subcontractor: "A" })),
      incident({ subcontractor: "C" }),
      incident({ subcontractor: "D" }),
      incident({}),
    ];
    expect(incidentsBySubcontractor(rows, 10).map((item) => [item.key, item.count])).toEqual([
      ["B", 3],
      ["A", 2],
      ["", 1],
      ["C", 1],
      ["D", 1],
    ]);
    const folded = incidentsBySubcontractor(rows, 3);
    expect(folded).toHaveLength(3);
    expect(folded[2]).toMatchObject({ other: true, count: 3 });
  });

  it("splits severity into shares and drops empty levels", () => {
    const slices = severityDistribution([incident({}), incident({ severity: "critical" }), incident({ severity: "critical" }), incident({ severity: "low" })]);
    expect(slices.map((slice) => [slice.severity, slice.count])).toEqual([
      ["critical", 2],
      ["low", 1],
      ["unrated", 1],
    ]);
    expect(slices[0].share).toBe(0.5);
    expect(severityDistribution([])).toEqual([]);
  });
});

describe("action owner role and join requests", () => {
  it("lets an action owner see only their tasks and managers hand out the role", () => {
    expect(mapRole("action_owner")).toBe("action_owner");
    expect(can("action_owner", "tasks.view")).toBe(true);
    expect(can("action_owner", "dashboard.view")).toBe(false);
    expect(assignableRoles("hse_manager")).toContain("action_owner");
  });

  it("queues a join request once, answers already_member, and turns approval into a profile", async () => {
    const repo = createMockRepository();
    expect(await repo.requestMembership({ organizationId: "org-nordic", email: " New.Worker@Example.se ", name: "New Worker" })).toBe("requested");
    expect(await repo.requestMembership({ organizationId: "org-nordic", email: "new.worker@example.se" })).toBe("requested");
    const queue = await repo.listMembershipRequests();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ email: "new.worker@example.se", fullName: "New Worker", status: "pending" });

    const created = await repo.createStaff({ fullName: "New Worker", role: "worker", organizationId: "org-nordic", email: queue[0].email });
    await repo.decideMembership(queue[0].id, "approved", null);
    expect(created.profile.role).toBe("worker");
    expect(await repo.listMembershipRequests()).toHaveLength(0);
    expect(await repo.requestMembership({ organizationId: "org-nordic", email: "new.worker@example.se" })).toBe("already_member");
    await expect(repo.requestMembership({ organizationId: "org-nordic", email: "not-an-email" })).rejects.toThrow();
  });

  it("manages subcontractors per company", async () => {
    const repo = createMockRepository();
    const created = await repo.createSubcontractor("org-volvo", "Safe Scaffolds AB");
    await expect(repo.createSubcontractor("org-volvo", "safe scaffolds ab")).rejects.toThrow();
    expect((await repo.listSubcontractors("org-volvo")).map((item) => item.name)).toContain("Safe Scaffolds AB");
    expect((await repo.listSubcontractors("org-nordic")).map((item) => item.name)).not.toContain("Safe Scaffolds AB");
    await repo.removeSubcontractor(created.id);
    expect((await repo.listSubcontractors("org-volvo")).map((item) => item.name)).not.toContain("Safe Scaffolds AB");
  });
});

describe("assignment e-mail", () => {
  const base = {
    incident: {
      reference: "SS-2026-0042",
      type: "hazard" as const,
      severity: "high" as const,
      description: "Loose <b>scaffold</b> board",
      summarySv: "Lös planka på ställning.",
      siteName: "Plant A",
      locationName: "Line 2",
    },
    recipientName: "Johan",
    assignedBy: "Erik",
    dueDate: "2026-11-03",
    note: "Fix before Friday",
    dashboardUrl: "https://app.example/dashboard?incidentId=1",
  };

  it("names the report, the due date and the sender in the recipient's language, and escapes HTML", () => {
    const en = buildAssignmentEmail({ ...base, language: "en" });
    expect(en.subject).toBe("You have a new assigned hazard · SS-2026-0042");
    expect(en.text).toContain("Erik assigned this report to you");
    expect(en.text).toContain("Fix before Friday");
    expect(en.html).toContain("Loose &lt;b&gt;scaffold&lt;/b&gt; board");
    expect(en.html).not.toContain("<b>scaffold</b>");
    const sv = buildAssignmentEmail({ ...base, language: "sv" });
    expect(sv.subject).toContain("ny tilldelad risk");
    expect(sv.text).toContain("november");
  });

  it("words the e-mail for the investigator and the follow-up person differently", () => {
    const investigator = buildAssignmentEmail({ ...base, language: "en", role: "investigator" });
    expect(investigator.subject).toBe("You are asked to investigate · SS-2026-0042");
    expect(investigator.text).toContain("root cause");
    const named = buildAssignmentEmail({ ...base, language: "en", role: "follow_up" });
    expect(named.subject).toBe("You will check a fix · SS-2026-0042");
    const ready = buildAssignmentEmail({ ...base, language: "en", role: "follow_up_ready" });
    expect(ready.subject).toContain("waiting for your check");
    expect(buildAssignmentEmail({ ...base, language: "tr", role: "investigator" }).subject).toContain("Araştırmanız");
  });
});

describe("QR links", () => {
  it("builds the link from the key and the company address", () => {
    expect(reportUrl("abc 1", "https://x.se")).toBe("https://x.se/report?k=abc%201");
    expect(companyBaseUrl("volvo", "https://app.se", "example.com")).toBe("https://volvo.example.com");
    expect(companyBaseUrl("volvo", "https://app.se", "")).toBe("https://app.se");
    expect(companyBaseUrl(null, "https://app.se", "example.com")).toBe("https://app.se");
  });

  it("turns a company name into a valid address and reads it back from the host", () => {
    expect(slugify("Volvo Personvagnar AB")).toBe("volvo-personvagnar-ab");
    expect(slugify("Åkerström & Söner")).toBe("akerstrom-soner");
    expect(slugify("!!!")).toBe("company");
    expect(isValidSlug("volvo")).toBe(true);
    expect(isValidSlug("www")).toBe(false);
    expect(isValidSlug("-bad")).toBe(false);
    expect(slugFromHost("volvo.example.com", "example.com")).toBe("volvo");
    expect(slugFromHost("volvo.example.com:3000", "example.com")).toBe("volvo");
    expect(slugFromHost("example.com", "example.com")).toBeNull();
    expect(slugFromHost("a.b.example.com", "example.com")).toBeNull();
    expect(slugFromHost("www.example.com", "example.com")).toBeNull();
    expect(slugFromHost("volvo.other.com", "example.com")).toBeNull();
    expect(slugFromHost("volvo.example.com", "")).toBeNull();
  });
});

describe("report keys (demo repository)", () => {
  it("resolves a key to its company and place, and stops the old key after a replacement", async () => {
    const repo = createMockRepository();
    const keys = await repo.listReportKeys();
    const siteKey = keys.find((item) => item.siteId);
    const companyKey = keys.find((item) => !item.siteId);
    expect(siteKey && companyKey).toBeTruthy();

    const target = await repo.resolveReportKey(siteKey!.key);
    expect(target).toMatchObject({ siteId: siteKey!.siteId, organizationId: siteKey!.organizationId });
    expect(await repo.resolveReportKey(companyKey!.key)).toMatchObject({ siteId: null, organizationId: companyKey!.organizationId });
    expect(await repo.resolveReportKey("nonsense")).toBeNull();

    const fresh = await repo.rotateReportKey({ siteId: siteKey!.siteId });
    expect(fresh).not.toBe(siteKey!.key);
    expect(await repo.resolveReportKey(siteKey!.key)).toBeNull();
    expect(await repo.resolveReportKey(fresh)).toMatchObject({ siteId: siteKey!.siteId });
  });
});

describe("work e-mail (tasks, checklists, areas)", () => {
  const base = { recipientName: "Maria", assignedBy: "Anna", detail: "Go through every <b>board</b>.", place: "Kvillebäcken", dueDate: "2026-11-03", priority: "High", language: "en" as const, url: "https://app.example/tasks" };

  it("words each kind differently and escapes HTML", () => {
    const task = buildWorkEmail({ ...base, kind: "task", title: "Check the boards" });
    expect(task.subject).toBe("New task for you: Check the boards");
    expect(task.text).toContain("Anna gave you a task.");
    expect(task.text).toContain("High");
    expect(task.html).toContain("Go through every &lt;b&gt;board&lt;/b&gt;.");
    expect(buildWorkEmail({ ...base, kind: "audit", title: "Gas cylinder check" }).subject).toContain("checklist round");
    const area = buildWorkEmail({ ...base, kind: "area", title: "Roof Level 4", detail: null, priority: null, dueDate: null });
    expect(area.subject).toBe("You are now responsible for Roof Level 4");
    expect(area.text).not.toContain("Priority");
  });

  it("is written in the recipient language", () => {
    expect(buildWorkEmail({ ...base, kind: "task", title: "X", language: "sv" }).subject).toBe("Ny uppgift till dig: X");
    expect(buildWorkEmail({ ...base, kind: "task", title: "X", language: "tr" }).subject).toBe("Size yeni bir görev verildi: X");
  });
});
