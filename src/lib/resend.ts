import "server-only";
import { EMAIL_TEMPLATES, setEmailAssetBase, type EmailContext } from "@/lib/emails";

/**
 * Direct transactional email via Resend's HTTP API, for the few emails the app
 * sends itself rather than through the send-notification edge function (e.g.
 * the welcome email on sign-up). Best-effort: a missing key or a failed send
 * never blocks the action that triggered it.
 *
 * Needs RESEND_API_KEY on the server (the same key used in Admin → Integrations);
 * the From address defaults to the platform's verified sender.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function from(): string {
  return process.env.RESEND_FROM || "laundriroom <notifications@laundriroom.ng>";
}

async function send(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: from(), to, subject, html, text }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** "Welcome to laundriroom" — sent to a new customer right after sign-up. */
export async function sendWelcomeEmail(to: string, fullName: string): Promise<boolean> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  setEmailAssetBase(site);
  const ctx: EmailContext = {
    customer_name: fullName,
    email: to,
    order_url: `${site || ""}/customer/order`,
    signin_url: `${site || ""}/login`,
    support_url: `${site || ""}/customer/support`,
  };
  const { subject, html, text } = EMAIL_TEMPLATES.account_welcome(ctx);
  return send(to, subject, html, text);
}
