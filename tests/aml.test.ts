import { describe, expect, it } from "vitest";
import { buildAmlNoticeHtml, buildAmlNoticeModel } from "@/lib/compliance/aml-33a";
import type { Incident, Site } from "@/lib/types";

const site: Site = {
  id: "site",
  name: "Kvillebäcken Construction Site",
  city: "Gothenburg",
  address: "Kvillebäcksvägen 1",
  organizationName: "Nordic Siteworks AB",
  organizationNumber: "559123-4418",
  locations: [{ id: "loc", name: "Zone 3" }],
};

const incident: Incident = {
  id: "1",
  reference: "SS-2026-0196",
  type: "accident",
  siteId: "site",
  locationId: "loc",
  locationName: "Zone 3",
  category: "falls",
  severity: "critical",
  description: "Fell from scaffold.\nTaken to hospital.",
  mediaUrls: [],
  anonymous: false,
  reporterName: "Site worker",
  status: "open",
  createdAt: "2026-07-10T22:30:00.000Z",
  capa: null,
};

describe("buildAmlNoticeModel", () => {
  it("renders the event time in Europe/Stockholm and fills statutory fields", () => {
    const model = buildAmlNoticeModel(incident, site);
    expect(model.eventDate).toBe("2026-07-11");
    expect(model.eventTime).toBe("00:30");
    expect(model.organizationName).toBe("Nordic Siteworks AB");
    expect(model.organizationNumber).toBe("559123-4418");
    expect(model.specificLocation).toBe("Zone 3");
    expect(model.capaAssignee).toContain("Not assigned");
    expect(model.immediateContainment).toContain("Ej ännu dokumenterat");
  });

  it("degrades gracefully without a site", () => {
    const model = buildAmlNoticeModel({ ...incident, siteName: "Fallback" }, null);
    expect(model.siteName).toBe("Fallback");
    expect(model.organizationNumber).toBe("—");
  });
});

describe("buildAmlNoticeHtml", () => {
  it("escapes user text and keeps line breaks", () => {
    const html = buildAmlNoticeHtml(buildAmlNoticeModel({ ...incident, description: "<img src=x> & more\nline" }, site));
    expect(html).toContain("&lt;img src=x&gt; &amp; more<br />line");
    expect(html).not.toContain("<img src=x>");
  });
});
