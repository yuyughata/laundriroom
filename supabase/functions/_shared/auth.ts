// deno-lint-ignore-file no-explicit-any
// Who may call the server-only functions (send-notification, send-newsletter,
// process-payouts)? Only callers holding the project's service key.
//
// Supabase projects now have two kinds of service key: the older JWT
// ("eyJ…", role service_role) and the newer secret keys ("sb_secret_…").
// The functions' own SUPABASE_SERVICE_ROLE_KEY may be either, and the app
// may hold the other, so an exact string match isn't enough. A key is
// accepted when it is:
//   1. this function's SUPABASE_SERVICE_ROLE_KEY, or
//   2. one of the project's secret keys (SUPABASE_SECRET_KEYS), or
//   3. a JWT that Supabase Auth's admin API accepts — that API answers only
//      to the service role, so a 200 proves the key (signature included).
// Accepted keys are remembered for the life of the function instance.

const accepted = new Set<string>();

export function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

export async function isServiceCaller(req: Request): Promise<boolean> {
  const token = bearer(req);
  if (!token) return false;
  if (accepted.has(token)) return true;

  const own = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (own && token === own) return remember(token);

  try {
    const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const keys = Array.isArray(all) ? all : Object.values(all ?? {});
    if (keys.some((k: any) => typeof k === "string" && k === token)) return remember(token);
  } catch { /* not set or not JSON */ }

  if (!token.startsWith("eyJ") && !token.startsWith("sb_secret_")) return false;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: token, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    await res.body?.cancel();
    if (res.ok) return remember(token);
  } catch { /* Auth unreachable: refuse */ }
  return false;
}

function remember(token: string) {
  accepted.add(token);
  return true;
}
