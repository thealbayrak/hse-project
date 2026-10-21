import { NextResponse } from "next/server";
import { checkStaffRequest } from "@/lib/admin/staff-rules";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mapProfile, mapRole, type ProfileQueryRow } from "@/lib/supabase/mappers";
import { createAnonServerClient, createServerSupabaseClient } from "@/lib/supabase/server";
import type { CreateStaffInput, CreateStaffResult } from "@/lib/types";

export const runtime = "nodejs";

const PROFILE_SELECT = "*, sites ( id, name ), manager:profiles!profiles_reports_to_fkey ( id, full_name )";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Adds a person to a company. With e-mail and password the person also gets
 * a login: directly when the service key is configured, otherwise through
 * Supabase sign-up (the person confirms the e-mail first).
 * The profile row is written with the caller's own session, so row level
 * security decides once more whether the caller may do this.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return fail(503, "Supabase is not configured.");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sign in first.");

  const me = await supabase.rpc("current_profile");
  const caller = me.data && typeof me.data === "object" && "id" in me.data && me.data.id ? me.data : null;
  if (!caller) return fail(403, "Your account is not in the people list.");

  let input: Partial<CreateStaffInput>;
  try {
    input = (await request.json()) as Partial<CreateStaffInput>;
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const check = checkStaffRequest(input, { role: mapRole(caller.role), organizationId: caller.organization_id });
  if (!check.ok) return fail(check.status, check.error);

  if (check.email) {
    const existing = await supabase.from("profiles").select("id").ilike("email", check.email).maybeSingle();
    if (existing.data) return fail(409, "Someone with this e-mail is already in the list.");
  }

  let authUserId: string | null = null;
  let login: CreateStaffResult["login"] = "none";
  const admin = createServiceSupabaseClient();

  if (check.email && check.password) {
    if (admin) {
      const created = await admin.auth.admin.createUser({
        email: check.email,
        password: check.password,
        email_confirm: true,
        user_metadata: { full_name: input.fullName?.trim() },
      });
      if (created.error) {
        if (/already|registered|exists/i.test(created.error.message)) login = "existing";
        else return fail(400, created.error.message);
      } else {
        authUserId = created.data.user.id;
        login = "created";
      }
    } else {
      const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
      const signed = await createAnonServerClient().auth.signUp({
        email: check.email,
        password: check.password,
        options: { data: { full_name: input.fullName?.trim() }, emailRedirectTo: origin ? `${origin}/login` : undefined },
      });
      if (signed.error) {
        if (/already|registered|exists/i.test(signed.error.message)) login = "existing";
        else return fail(400, signed.error.message);
      } else if (signed.data.user && signed.data.user.identities?.length === 0) {
        // Supabase hides whether the address exists; an empty identity list means it does.
        login = "existing";
      } else {
        authUserId = signed.data.user?.id ?? null;
        login = signed.data.session ? "created" : "confirm";
      }
    }
  }

  const inserted = await supabase
    .from("profiles")
    .insert({
      full_name: input.fullName!.trim(),
      email: check.email,
      phone: input.phone?.trim() || null,
      role: input.role!,
      organization_id: check.organizationId,
      site_id: input.siteId || null,
      all_sites: input.allSites ?? true,
      site_ids: input.allSites === false && Array.isArray(input.siteIds) ? input.siteIds.filter((id) => typeof id === "string") : [],
      employee_no: input.employeeNo?.trim() || null,
      auth_user_id: authUserId,
    })
    .select(PROFILE_SELECT)
    .single();

  if (inserted.error) {
    if (admin && authUserId && login === "created") await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return fail(400, inserted.error.message);
  }

  return NextResponse.json({ ok: true, profile: mapProfile(inserted.data as unknown as ProfileQueryRow), login });
}
