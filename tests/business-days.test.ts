import { describe, expect, it } from "vitest";
import { addBusinessDays, addBusinessDaysIsoDate } from "@/lib/skyddsrond/business-days";

describe("addBusinessDays", () => {
  it("skips Saturday and Sunday", () => {
    // Thursday 2026-10-15 + 3 business days = Tuesday 2026-10-20
    const result = addBusinessDays(new Date("2026-10-15T10:00:00Z"), 3);
    expect(result.toISOString().slice(0, 10)).toBe("2026-10-20");
  });

  it("starts counting from the next day even on a weekend", () => {
    // Saturday 2026-10-17 + 1 business day = Monday 2026-10-19
    const result = addBusinessDays(new Date("2026-10-17T10:00:00Z"), 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-10-19");
  });
});

describe("addBusinessDaysIsoDate", () => {
  it("formats the date in Europe/Stockholm", () => {
    // 23:30 UTC on Friday is already Saturday 01:30 in Stockholm (CEST).
    const result = addBusinessDaysIsoDate(new Date("2026-07-10T23:30:00Z"), 2);
    expect(result).toBe("2026-07-14");
  });
});
