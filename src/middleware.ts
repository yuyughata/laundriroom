import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // everything except static assets, the manifest, the service worker and
    // the offline page (those must load for signed-out visitors too — a
    // redirected sw.js fails to register, and the SW would cache the sign-in
    // page as the offline page)
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|offline.html|.*\\.(?:png|jpg|svg)$).*)",
  ],
};
