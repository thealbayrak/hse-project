import type { Role } from "@/lib/types";

/**
 * What each role may do. Workers never sign in: they report and track.
 * A signed-in user without a profile row has no access; the owner or a company
 * manager adds people (Settings) and the database scopes data to their company.
 * Data is scoped to the person's organisation by the database; a super admin
 * sees every organisation.
 */
export type Permission =
  | "dashboard.view"
  | "incident.manage"
  | "walk.conduct"
  | "reports.view"
  | "tasks.view"
  | "tasks.assign"
  | "people.manage"
  | "meeting.plan"
  | "audits.conduct"
  | "audits.manage"
  | "settings.manage"
  | "projects.manage"
  | "area.view"
  | "incident.assign"
  | "actions.work"
  | "investigations.work"
  | "followups.review"
  | "admin.dashboard";

const OFFICER: Permission[] = [
  "dashboard.view",
  "incident.manage",
  "walk.conduct",
  "reports.view",
  "tasks.view",
  "tasks.assign",
  "meeting.plan",
  "audits.conduct",
  "audits.manage",
  "incident.assign",
  "investigations.work",
  "followups.review",
];

const MANAGER: Permission[] = [...OFFICER, "people.manage", "settings.manage", "admin.dashboard"];

const MATRIX: Record<Role, Permission[]> = {
  worker: [],
  foreman: ["dashboard.view", "tasks.view", "reports.view", "audits.conduct"],
  // The field supervisor of an area: sees the reports of that area and puts the right people on them.
  area_responsible: ["area.view", "incident.assign", "tasks.view"],
  // Works only on what is assigned to them: the repairs, with proof, until they are marked done.
  action_owner: ["tasks.view", "actions.work"],
  // Writes the root-cause analysis of the reports they are asked to investigate.
  investigator: ["investigations.work", "tasks.view"],
  // Checks that a finished repair really is finished.
  follow_up: ["followups.review", "tasks.view"],
  safety_officer: OFFICER,
  hse_manager: MANAGER,
  admin: MANAGER,
  // Only the app owner creates companies, prints their QR codes and appoints managers.
  super_admin: [...MANAGER, "projects.manage"],
};

/** A signed-in account that is not in the people list gets no access until someone adds it. */
export const DEFAULT_SIGNED_IN_ROLE: Role = "worker";

export function can(role: Role | null | undefined, permission: Permission) {
  return MATRIX[role ?? "worker"].includes(permission);
}

/** Routes that need a signed-in user, and the permission each one needs on top. */
export const PROTECTED_ROUTES: { prefix: string; permission: Permission }[] = [
  { prefix: "/dashboard/area", permission: "area.view" },
  { prefix: "/dashboard/my-actions", permission: "actions.work" },
  { prefix: "/dashboard/investigations", permission: "investigations.work" },
  { prefix: "/dashboard/follow-ups", permission: "followups.review" },
  { prefix: "/admin", permission: "admin.dashboard" },
  { prefix: "/super-admin", permission: "projects.manage" },
  { prefix: "/dashboard", permission: "dashboard.view" },
  { prefix: "/board", permission: "dashboard.view" },
  { prefix: "/skyddsrond", permission: "walk.conduct" },
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/tasks", permission: "tasks.view" },
  { prefix: "/people", permission: "people.manage" },
  { prefix: "/audits", permission: "audits.conduct" },
  { prefix: "/projects", permission: "projects.manage" },
  { prefix: "/settings", permission: "settings.manage" },
];
