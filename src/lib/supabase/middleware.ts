import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { safeNext } from "@/lib/nav";

/** Role → home dashboard. */
const HOME: Record<string, string> = {
  customer: "/customer",
  attendant: "/vendor/queue",
  vendor_manager: "/vendor/queue",
  rider: "/vendor/queue",
  platform_admin: "/admin",
  support_agent: "/admin",
};

const PUBLIC_PATHS = ["/", "/login", "/signup", "/verify-email", "/auth", "/apply", "/api/health", "/forgot-password", "/reset-password", "/v", "/unsubscribe", "/api/unsubscribe"];

/**
 * Refreshes the Supabase session on every request and guards the role areas.
 * Unauthenticated users hitting a protected area are sent to /login; signed-in
 * users are kept inside the area their role allows.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // If env is not configured yet, don't block the app — let pages render.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return response;

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup" || path === "/")) {
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    const url = request.nextUrl.clone();
    // Already signed in: go where the sign-in link was taking them (e.g. a
    // vendor's order form), else to their dashboard.
    const next = path === "/" ? null : safeNext(request.nextUrl.searchParams.get("next"));
    url.pathname = HOME[profile?.role ?? "customer"] ?? "/customer";
    url.search = "";
    if (next) return NextResponse.redirect(new URL(next, request.url));
    return NextResponse.redirect(url);
  }

  return response;
}
