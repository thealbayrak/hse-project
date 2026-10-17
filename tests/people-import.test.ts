import { describe, expect, it } from "vitest";
import { matchHeader, rowsFromSheet } from "@/lib/people/import";

describe("matchHeader", () => {
  it("matches Swedish, English and Turkish headers loosely", () => {
    expect(matchHeader("Namn")).toBe("fullName");
    expect(matchHeader("Ad Soyad")).toBe("fullName");
    expect(matchHeader("E-post")).toBe("email");
    expect(matchHeader("E-posta")).toBe("email");
    expect(matchHeader("Roll")).toBe("role");
    expect(matchHeader("Ünvan")).toBe("role");
    expect(matchHeader("Arbetsställe")).toBe("siteName");
    expect(matchHeader("Şantiye")).toBe("siteName");
    expect(matchHeader("Chef")).toBe("reportsToName");
    expect(matchHeader("manager_email")).toBe("reportsToEmail");
    expect(matchHeader("Sicil No")).toBe("employeeNo");
    expect(matchHeader("Shoe size")).toBeNull();
  });
});

describe("rowsFromSheet", () => {
  it("builds import rows and normalises roles", () => {
    const rows = rowsFromSheet([
      { Namn: "Anna Berg", "E-post": "anna@example.com", Roll: "Arbetsmiljöchef", Arbetsställe: "Kv. Norra" },
      { Namn: "Ali Yilmaz", Rol: "işçi", Şef: "Johan Ek", "Sicil No": 1042 },
      { Namn: "", Roll: "worker" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ fullName: "Anna Berg", email: "anna@example.com", role: "hse_manager", siteName: "Kv. Norra" });
    expect(rows[1]).toMatchObject({ fullName: "Ali Yilmaz", role: "worker", reportsToName: "Johan Ek", employeeNo: "1042" });
  });
});
