import type { CreateStaffInput, Role } from "@/lib/types";

/** Roles a company manager may hand out; managers themselves are appointed by the owner. */
export const MANAGER_ASSIGNABLE_ROLES: Role[] = ["worker", "foreman", "safety_officer"];
export const OWNER_ASSIGNABLE_ROLES: Role[] = ["worker", "foreman", "safety_officer", "hse_manager", "admin", "super_admin"];

export function assignableRoles(callerRole: Role | null | undefined): Role[] {
  if (callerRole === "super_admin") return OWNER_ASSIGNABLE_ROLES;
  if (callerRole === "hse_manager" || callerRole === "admin") return MANAGER_ASSIGNABLE_ROLES;
  return [];
}

export type StaffCheck =
  | { ok: true; organizationId: string | null; email: string | null; password: string | null }
  | { ok: false; status: number; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a request to add a person. The database enforces the same rules
 * (row level security); this gives clear messages before anything is created.
 */
export function checkStaffRequest(
  input: Partial<CreateStaffInput>,
  caller: { role: Role | null; organizationId: string | null }
): StaffCheck {
  const fullName = (input.fullName ?? "").trim();
  if (fullName.length < 2) return { ok: false, status: 400, error: "Name is required." };
  if (!input.role || !assignableRoles(caller.role).includes(input.role)) {
    return { ok: false, status: 403, error: "You may not give this role." };
  }

  let organizationId: string | null;
  if (caller.role === "super_admin") {
    organizationId = input.organizationId ?? null;
    if (!organizationId && input.role !== "super_admin") return { ok: false, status: 400, error: "Choose the company." };
  } else {
    if (!caller.organizationId) return { ok: false, status: 403, error: "Your account is not linked to a company." };
    if (input.organizationId && input.organizationId !== caller.organizationId) {
      return { ok: false, status: 403, error: "You can only add people to your own company." };
    }
    organizationId = caller.organizationId;
  }

  const email = input.email?.trim().toLowerCase() || null;
  const password = input.password ?? null;
  if (email && !EMAIL.test(email)) return { ok: false, status: 400, error: "The e-mail address looks wrong." };
  if (password && !email) return { ok: false, status: 400, error: "A login needs an e-mail address." };
  if (password && password.length < 8) return { ok: false, status: 400, error: "The password needs at least 8 characters." };
  return { ok: true, organizationId, email, password: password || null };
}
