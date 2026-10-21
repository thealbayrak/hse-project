import type { Role } from "@/lib/types";

/**
 * The first page each role sees after signing in. Workers never sign in (they
 * only use the QR code), so they and unknown accounts land on the home page.
 */
export function landingFor(role: Role | null | undefined): string {
  switch (role) {
    case "super_admin":
      return "/projects";
    case "hse_manager":
    case "admin":
    case "safety_officer":
    case "foreman":
      return "/dashboard";
    case "action_owner":
      return "/tasks";
    default:
      return "/";
  }
}
