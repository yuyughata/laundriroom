import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

/**
 * Server Supabase client for Server Components, Route Handlers and Server
 * Actions. Reads/writes the auth cookies so the session is available on the
 * server. Still bound by RLS (uses the anon key with the user's JWT).
 */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — safe to ignore; middleware refreshes.
          }
        },
      },
    }
  );
}

/**
 * Privileged client using the service-role key. NEVER import this into client
 * code. Use only in trusted server code / route handlers for operations that
 * must bypass RLS (e.g. reconciling a Paystack webhook). Returns null if the
 * key is not configured, so callers can degrade gracefully.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const { createClient: createRaw } = require("@supabase/supabase-js");
  return createRaw(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
