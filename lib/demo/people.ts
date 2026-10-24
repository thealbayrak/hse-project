import type { Profile, Role } from "@/lib/types";

/** The demo has no passwords: each person below can be "viewed as" from the demo switcher. */
function person(
  id: string,
  fullName: string,
  role: Role,
  organizationId: string | null,
  extra: Partial<Profile> = {}
): Profile {
  return {
    id,
    fullName,
    email: `${fullName.toLowerCase().replaceAll(/[^a-z]+/g, ".").replace(/\.$/, "")}@example.se`,
    phone: null,
    role,
    organizationId,
    siteId: null,
    siteName: null,
    employeeNo: null,
    reportsTo: null,
    reportsToName: null,
    language: null,
    active: true,
    allSites: true,
    siteIds: [],
    ...extra,
  };
}

/** Everyone in the demo companies. The first entry of each role group is the one the switcher offers. */
export const DEMO_PEOPLE: Profile[] = [
  person("p-owner", "Enes Albayrak", "super_admin", null, { email: "owner@example.se", employeeNo: "0001" }),

  // Nordic Siteworks AB (construction): one place
  person("p-anna", "Anna Bergström", "hse_manager", "org-nordic", { email: "anna.bergstrom@example.se", employeeNo: "1001", language: "sv" }),
  person("p-erik", "Erik Lindqvist", "safety_officer", "org-nordic", {
    email: "erik.lindqvist@example.se",
    siteId: "site-kvillebacken",
    siteName: "Kvillebäcken Construction Site",
    employeeNo: "1002",
    reportsTo: "p-anna",
    reportsToName: "Anna Bergström",
    language: "sv",
  }),
  person("p-johan", "Johan Ek", "foreman", "org-nordic", {
    email: "johan.ek@example.se",
    siteId: "site-kvillebacken",
    siteName: "Kvillebäcken Construction Site",
    employeeNo: "2001",
    reportsTo: "p-erik",
    reportsToName: "Erik Lindqvist",
    language: "sv",
  }),
  person("p-maria", "Maria Holm", "action_owner", "org-nordic", {
    email: "maria.holm@example.se",
    siteId: "site-kvillebacken",
    siteName: "Kvillebäcken Construction Site",
    employeeNo: "2002",
    reportsTo: "p-anna",
    reportsToName: "Anna Bergström",
    language: "sv",
  }),
  person("p-ali", "Ali Yılmaz", "worker", "org-nordic", {
    email: null,
    siteId: "site-kvillebacken",
    siteName: "Kvillebäcken Construction Site",
    employeeNo: "3001",
    reportsTo: "p-johan",
    reportsToName: "Johan Ek",
    language: "tr",
  }),
  person("p-piotr", "Piotr Nowak", "worker", "org-nordic", {
    email: null,
    siteId: "site-kvillebacken",
    siteName: "Kvillebäcken Construction Site",
    employeeNo: "3002",
    reportsTo: "p-johan",
    reportsToName: "Johan Ek",
    language: "pl",
  }),

  // Volvo Personvagnar AB (car plant): two places, one safety officer who only sees Torslanda
  person("p-lars", "Lars Nyberg", "hse_manager", "org-volvo", { employeeNo: "4001", language: "sv" }),
  person("p-eva", "Eva Lind", "safety_officer", "org-volvo", {
    siteId: "site-torslanda",
    siteName: "Volvo Torslanda Plant",
    allSites: false,
    siteIds: ["site-torslanda"],
    employeeNo: "4002",
    reportsTo: "p-lars",
    reportsToName: "Lars Nyberg",
    language: "sv",
  }),
  person("p-nils", "Nils Berg", "action_owner", "org-volvo", {
    siteId: "site-torslanda",
    siteName: "Volvo Torslanda Plant",
    allSites: false,
    siteIds: ["site-torslanda"],
    employeeNo: "4003",
    reportsTo: "p-lars",
    reportsToName: "Lars Nyberg",
    language: "sv",
  }),
  person("p-mehmet", "Mehmet Kaya", "worker", "org-volvo", {
    email: null,
    siteId: "site-torslanda",
    siteName: "Volvo Torslanda Plant",
    employeeNo: "5001",
    language: "tr",
  }),
  person("p-jonas", "Jonas Ström", "worker", "org-volvo", {
    email: null,
    siteId: "site-skovde",
    siteName: "Volvo Skövde Engine Plant",
    employeeNo: "5002",
    language: "sv",
  }),

  // Sydkomponent AB (factory)
  person("p-sofia", "Sofia Karlsson", "hse_manager", "org-sydkomp", { employeeNo: "6001", language: "sv" }),
  person("p-tomas", "Tomas Ahl", "safety_officer", "org-sydkomp", {
    siteId: "site-malmo",
    siteName: "Malmö Component Works",
    employeeNo: "6002",
    reportsTo: "p-sofia",
    reportsToName: "Sofia Karlsson",
    language: "sv",
  }),
];

/** Stands in for "someone who scanned the QR code": no account, sees only the report form. */
export const DEMO_WORKER_VIEWER: Profile = person("worker", "Worker", "worker", null, { email: null });

/** One entry per switcher choice; "worker" is not a person but the QR-code form seen without an account. */
export const DEMO_PERSONA_IDS = ["p-owner", "p-anna", "p-erik", "p-maria", "p-lars", "p-eva", "p-nils", "worker"] as const;
export type DemoPersonaId = (typeof DEMO_PERSONA_IDS)[number];

export function demoProfile(id: string): Profile | null {
  return DEMO_PEOPLE.find((item) => item.id === id) ?? null;
}

/** The page a demo visitor lands on after choosing who to view as. */
export const DEMO_WORKER_URL = "/report?k=demo-site-kvillebacken";
