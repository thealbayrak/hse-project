import { describe, expect, it } from "vitest";
import { buildIncidentsPdfHtml } from "@/lib/export";
import { csvEscape } from "@/lib/format";
import type { Incident } from "@/lib/types";

const incident: Incident = {
  id: "1",
  reference: "SS-2026-0001",
  type: "hazard",
  siteId: "6a1d0c4e-3c6c-4c35-9f2e-4a9d7b8a0001",
  locationId: "6a1d0c4e-3c6c-4c35-9f2e-4a9d7b8a0002",
  siteName: "Live Site <AB>",
  locationName: "Hall & Yard",
  category: "machine",
  severity: "high",
  description: "x",
  mediaUrls: [],
  anonymous: false,
  reporterName: "Site worker",
  status: "open",
  createdAt: "2026-09-08T07:40:00.000Z",
  capa: { assigneeId: "off-anna", assigneeName: "<script>alert(1)</script>", dueDate: "2026-09-10", status: "open", notes: "", updatedAt: "" },
};

describe("csvEscape", () => {
  it("quotes values with commas, quotes or newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
  });
});

describe("buildIncidentsPdfHtml", () => {
  it("uses live site names (not raw UUIDs) and escapes every value", () => {
    const html = buildIncidentsPdfHtml([incident], {
      totalReports: 1,
      openActions: 1,
      criticalNearMisses: 0,
      daysIncidentFree: 12,
    });
    expect(html).toContain("Live Site &lt;AB&gt;");
    expect(html).toContain("Hall &amp; Yard");
    expect(html).not.toContain("6a1d0c4e-3c6c-4c35-9f2e-4a9d7b8a0001");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<strong>12</strong>");
  });
});
