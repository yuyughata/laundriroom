// deno-lint-ignore-file no-explicit-any
// ============================================================================
// create-payment — initialise an online payment for an order with the provider
// chosen by the admin (platform_settings.payment_provider: paystack|flutterwave).
// Returns { authorization_url } for the client to redirect to. The matching
// webhook confirms the payment; the laundry then closes the order with the
// customer's delivery code (0046).
//
// Body: { order_id, site_url? } — site_url (the app's address) is where the
// provider sends the customer back when the SITE_URL secret isn't set.
// Paystack/Flutterwave need a real-looking email for the receipt. Customers
// without one (phone-only walk-ins) or with a test address (".test",
// ".example", …) pay with payments+<order code>@<your domain> instead; the
// domain is the Resend From address's, else the site's.
// On a provider error the pending payment row is marked failed and the
// provider's own message is returned (and logged).
//
// Deploy:  supabase functions deploy create-payment
// Secrets: PAYSTACK_SECRET_KEY=sk_...   FLUTTERWAVE_SECRET_KEY=FLWSECK-...
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const RESERVED_TLD = /\.(test|example|invalid|localhost|local|internal)$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const { order_id, site_url = "" } = await req.json().catch(() => ({}));
  if (!order_id) return json({ error: "order_id required" }, 400);
  const SITE = (Deno.env.get("SITE_URL") || (/^https?:\/\//.test(String(site_url)) ? String(site_url) : "") || "http://localhost:3000")
    .replace(/\/$/, "");

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Who is calling? Only the order's customer may start its payment.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: "sign in required" }, 401);

  // which provider?
  const { data: settings } = await db.from("platform_settings").select("payment_provider").eq("id", true).single();
  const provider = settings?.payment_provider ?? "paystack";

  const { data: order } = await db
    .from("orders")
    .select("id, code, total, status, customer_id, profiles:customer_id(email, phone, full_name)")
    .eq("id", order_id)
    .single();
  if (!order || order.customer_id !== user.id) return json({ error: "order not found" }, 404);
  if ((order as any).status === "cancelled") return json({ error: "This order was cancelled." }, 409);
  if (!(Number(order.total) > 0)) return json({ error: "There's nothing to pay on this order yet." }, 409);
  const { count: paid } = await db.from("payments").select("id", { count: "exact", head: true })
    .eq("order_id", order_id).eq("status", "succeeded");
  if ((paid ?? 0) > 0) return json({ error: "This order is already paid." }, 409);

  const email = await receiptEmail(db, (order as any).profiles?.email, order.code, SITE);
  if (!email) return json({ error: "Add an email address to your account to pay online." }, 400);

  // Record a pending payment row.
  const { data: payment } = await db
    .from("payments")
    .insert({ order_id, amount: order.total, method: provider, status: "pending" })
    .select("id")
    .single();
  const reference = `${order.code}-${payment?.id ?? Date.now()}`;
  const callback = `${SITE}/customer/orders/${order_id}?paid=1`;
  const fail = async (message: string) => {
    console.error(`create-payment ${provider} refused ${order.code}: ${message}`);
    if (payment?.id) await db.from("payments").update({ status: "failed", reference }).eq("id", payment.id);
    return json({ error: message, provider }, 502);
  };

  let authorization_url: string | null = null;

  if (provider === "flutterwave") {
    const KEY = Deno.env.get("FLUTTERWAVE_SECRET_KEY")?.trim();
    if (!KEY) return fail("Flutterwave isn't configured (FLUTTERWAVE_SECRET_KEY).");
    const res = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: reference,
        amount: Number(order.total),
        currency: "NGN",
        redirect_url: callback,
        customer: { email, name: (order as any).profiles?.full_name ?? "Customer", phonenumber: (order as any).profiles?.phone ?? undefined },
        meta: { order_id, payment_id: payment?.id },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.status !== "success") return fail(body?.message ?? `Flutterwave error ${res.status}`);
    authorization_url = body.data.link;
  } else {
    const KEY = Deno.env.get("PAYSTACK_SECRET_KEY")?.trim();
    if (!KEY) return fail("Paystack isn't configured (PAYSTACK_SECRET_KEY).");
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: Math.round(Number(order.total) * 100), // kobo
        reference,
        callback_url: callback,
        metadata: { order_id, payment_id: payment?.id, order_code: order.code },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.status) return fail(body?.message ?? `Paystack error ${res.status}`);
    authorization_url = body.data.authorization_url;
  }

  await db.from("payments").update({ reference }).eq("id", payment?.id);
  return json({ authorization_url, reference, provider });
});

/**
 * The email the provider sends its receipt to: the customer's, if it's a real
 * address; otherwise payments+<order code>@<our domain> (Resend From domain,
 * else the site's), so customers without a usable email can still pay.
 */
async function receiptEmail(db: any, own: string | null | undefined, code: string, site: string): Promise<string | null> {
  const mine = String(own ?? "").trim();
  if (EMAIL.test(mine) && !RESERVED_TLD.test(mine)) return mine;
  let domain = "";
  const { data: integ } = await db.from("integration_settings").select("config").eq("provider", "resend").maybeSingle();
  const from = String(integ?.config?.from ?? "");
  domain = from.match(/@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i)?.[1] ?? "";
  if (!domain || RESERVED_TLD.test(domain)) {
    try { domain = new URL(site).hostname.replace(/^www\./, ""); } catch { domain = ""; }
  }
  if (!domain || !/\.[a-z]{2,}$/i.test(domain) || RESERVED_TLD.test(domain)) return null;
  return `payments+${code.toLowerCase()}@${domain}`;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
