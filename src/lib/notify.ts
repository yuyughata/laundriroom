/**
 * Server-side: ask the send-notification edge function to email a user about
 * their account (password changed, details updated, suspended…). Uses the
 * service-role key, so only call it from server actions / route handlers.
 * Best-effort: a failed or unconfigured notification never blocks the action
 * that triggered it.
 */
export type AccountEvent = "password_changed" | "account_updated" | "account_suspended" | "account_reactivated";

export async function notifyUser(event: AccountEvent, userId: string, context: Record<string, string> = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  try {
    await fetch(`${url}/functions/v1/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({
        event,
        user_id: userId,
        context: {
          signin_url: `${site}/login`,
          account_url: `${site}/account/password`,
          support_url: `${site}/customer/support`,
          changed_at: new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }),
          ...context,
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // best-effort
  }
}
