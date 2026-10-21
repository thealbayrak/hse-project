import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Checks a Cloudflare Turnstile token for the anonymous report form. Without a
 * secret key configured the check is switched off and every call passes.
 */
export async function POST(request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return NextResponse.json({ ok: true, enabled: false });

  let token = "";
  try {
    const body = (await request.json()) as { token?: string };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

  const form = new URLSearchParams({ secret, response: token });
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) form.set("remoteip", forwarded);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const result = (await response.json()) as { success?: boolean };
    return NextResponse.json({ ok: Boolean(result.success), enabled: true }, { status: result.success ? 200 : 403 });
  } catch {
    return NextResponse.json({ ok: false, enabled: true, error: "Could not reach the check." }, { status: 502 });
  }
}
