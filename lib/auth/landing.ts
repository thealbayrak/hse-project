import type { Role } from "@/lib/types";

/**
 * The first page each role sees after signing in. Workers never sign in (they
 * only use the QR code), so they and unknown accounts land on the home page.
 */
export function landingFor(role: Role | null | undefined): string {
  switch (role) {
    case "super_admin":
      return "/super-admin";
    case "hse_manager":
    case "admin":
      return "/admin/dashboard";
    case "safety_officer":
    case "foreman":
      return "/dashboard";
    case "area_responsible":
      return "/dashboard/area";
    case "action_owner":
      return "/dashboard/my-actions";
    case "investigator":
      return "/dashboard/investigations";
    case "follow_up":
      return "/dashboard/follow-ups";
    default:
      return "/";
  }
}
