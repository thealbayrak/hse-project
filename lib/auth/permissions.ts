import type { Role } from "@/lib/types";

/**
 * What each role may do. Workers never sign in: they report and track.
 * A signed-in user without a profile row is treated as a safety officer so a
 * freshly created account is not locked out before the people list is imported.
 */
export type Permission =
  | "dashboard.view"
  | "incident.manage"
  | "walk.conduct"
  | "reports.view"
  | "tasks.view"
  | "tasks.assign"
  | "people.manage"
  | "meeting.plan";

const MATRIX: Record<Role, Permission[]> = {
  worker: [],
  foreman: ["dashboard.view", "tasks.view", "reports.view"],
  safety_officer: ["dashboard.view", "incident.manage", "walk.conduct", "reports.view", "tasks.view", "tasks.assign", "meeting.plan"],
  hse_manager: ["dashboard.view", "incident.manage", "walk.conduct", "reports.view", "tasks.view", "tasks.assign", "people.manage", "meeting.plan"],
  admin: ["dashboard.view", "incident.manage", "walk.conduct", "reports.view", "tasks.view", "tasks.assign", "people.manage", "meeting.plan"],
};

export const DEFAULT_SIGNED_IN_ROLE: Role = "safety_officer";

export function can(role: Role | null | undefined, permission: Permission) {
  return MATRIX[role ?? "worker"].includes(permission);
}

/** Routes that need a signed-in user, and the permission each one needs on top. */
export const PROTECTED_ROUTES: { prefix: string; permission: Permission }[] = [
  { prefix: "/dashboard", permission: "dashboard.view" },
  { prefix: "/skyddsrond", permission: "walk.conduct" },
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/tasks", permission: "tasks.view" },
  { prefix: "/people", permission: "people.manage" },
];
