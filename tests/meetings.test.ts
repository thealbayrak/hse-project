import { describe, expect, it } from "vitest";
import { buildIcs, icsDate, icsText } from "@/lib/meetings/ics";
import { buildMeetingEmail } from "@/lib/meetings/invite-email";
import { parseAnalysis } from "@/lib/supabase/mappers";
import type { Incident } from "@/lib/types";

const incident: Incident = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  reference: "SS-2026-0002",
  type: "near-miss",
  siteId: "s",
  locationId: "l",
  siteName: "Kvillebäcken",
  locationName: "Roof Level 4",
  category: "falls",
  severity: "critical",
  description: "<b>Guardrail</b> missing",
  summarySv: "Räcke saknas på tak.",
  mediaUrls: [],
  anonymous: true,
  reporterName: null,
  status: "open",
  createdAt: "2026-10-16T20:00:00.000Z",
  capa: null,
  aiAnalysis: {
    summary: "Fall risk from an unprotected edge.",
    rootCauses: ["Guardrail removed for crane lift & not reinstated"],
    immediateActions: ["Close the area"],
    preventiveActions: ["Permit-to-work for guardrail removal"],
    amlReportRequired: true,
    amlReason: "Serious near-miss.",
    riskLevel: "critical",
    meetingRecommended: true,
    meetingAgenda: ["Timeline", "Immediate containment"],
  },
};

describe("ics", () => {
  it("formats UTC timestamps and escapes text", () => {
    expect(icsDate(new Date("2026-10-20T07:30:00Z"))).toBe("20261020T073000Z");
    expect(icsText("a, b; c\nd")).toBe("a\\, b\\; c\\nd");
  });

  it("builds a REQUEST with organizer, attendees and alarm", () => {
    const ics = buildIcs({
      uid: "abc@test",
      start: new Date("2026-10-20T07:30:00Z"),
      durationMinutes: 45,
      summary: "Krismöte · SS-2026-0002",
      description: "Line one\nLine two",
      location: "Barack 2",
      organizer: { name: "Officer", email: "officer@example.se" },
      attendees: [{ name: "Anna", email: "anna@example.se" }],
      url: "https://app.example/dashboard",
    });
    // Long lines are folded with CRLF + space; unfold before asserting on content.
    const unfolded = ics.replaceAll("\r\n ", "");
    expect(unfolded).toContain("METHOD:REQUEST");
    expect(unfolded).toContain("DTSTART:20261020T073000Z");
    expect(unfolded).toContain("DTEND:20261020T081500Z");
    expect(unfolded).toContain("ATTENDEE;CN=Anna;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:anna@example.se");
    expect(unfolded).toContain("BEGIN:VALARM");
    expect(ics.split("\r\n").every((line) => line.length <= 75)).toBe(true);
  });
});

describe("meeting e-mail", () => {
  it("includes meeting, incident and analysis, escaped", () => {
    const email = buildMeetingEmail({
      meeting: {
        incidentId: incident.id,
        title: "Krismöte · SS-2026-0002",
        scheduledAt: "2026-10-20T07:30:00.000Z",
        durationMinutes: 30,
        location: "Teams",
        note: "Ta med ritningar",
        recipients: [{ name: "Anna", email: "anna@example.se" }],
      },
      incident,
      language: "sv",
      dashboardUrl: "https://app.example/dashboard?incidentId=x",
      organizer: { name: "Officer", email: "officer@example.se" },
    });
    expect(email.subject).toBe("Krismöte · SS-2026-0002");
    expect(email.html).toContain("&lt;b&gt;Guardrail&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Guardrail</b>");
    expect(email.html).toContain("Räcke saknas på tak.");
    expect(email.html).toContain("crane lift &amp; not reinstated");
    expect(email.html).toContain("Anmälan krävs");
    expect(email.text).toContain("Teams");
    expect(email.text).toContain("https://app.example/dashboard?incidentId=x");
  });
});

describe("parseAnalysis", () => {
  it("tolerates partial or malformed stored JSON", () => {
    expect(parseAnalysis(null)).toBeNull();
    expect(parseAnalysis({ rootCauses: ["x"] })).toBeNull();
    const parsed = parseAnalysis({ summary: "s", rootCauses: ["a", 1], riskLevel: "weird", meetingAgenda: "no" });
    expect(parsed?.rootCauses).toEqual(["a"]);
    expect(parsed?.riskLevel).toBe("medium");
    expect(parsed?.meetingAgenda).toEqual([]);
  });
});
