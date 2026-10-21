import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { slugFromHost } from "@/lib/qr/urls";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

/** Routes only signed-in staff may open. Field reporting (/report) and /track stay open. */
const PROTECTED_PREFIXES = ["/start", "/dashboard", "/board", "/skyddsrond", "/reports", "/tasks", "/people", "/audits", "/projects", "/settings"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  // A company address (volvo.<root domain>) is passed on so the page can show the company's name.
  request.headers.delete("x-company-slug");
  const companySlug = slugFromHost(request.headers.get("host") ?? "");
  if (companySlug) request.headers.set("x-company-slug", companySlug);

  // Demo mode (no Supabase): nothing to authenticate against.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refreshes the session cookie and tells us whether someone is signed in.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (user && pathname === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const target = request.nextUrl.clone();
    target.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next.split("?")[0] : "/start";
    target.search = next && next.includes("?") ? `?${next.split("?")[1]}` : "";
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/|splash/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
