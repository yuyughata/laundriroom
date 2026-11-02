// deno-lint-ignore-file no-explicit-any
// ============================================================================
// create-payment — initialise an online payment for an order with the provider
// chosen by the admin (platform_settings.payment_provider: paystack|flutterwave).
// Returns { authorization_url } for the client to redirect to. The matching
// webhook confirms the payment and closes/settles the order.
//
// Deploy:  supabase functions deploy create-payment
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_...
//          supabase secrets set FLUTTERWAVE_SECRET_KEY=FLWSECK-...
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SITE = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

  const { order_id } = await req.json().catch(() => ({}));
  if (!order_id) return json({ error: "order_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // which provider?
  const { data: settings } = await db.from("platform_settings").select("payment_provider").eq("id", true).single();
  const provider = settings?.payment_provider ?? "paystack";

  const { data: order } = await db
    .from("orders")
    .select("id, code, total, customer_id, profiles:customer_id(email, phone, full_name)")
    .eq("id", order_id)
    .single();
  if (!order) return json({ error: "order not found" }, 404);
  const email = (order as any).profiles?.email ?? "customer@laundriroom.example";

  // Record a pending payment row.
  const { data: payment } = await db
    .from("payments")
    .insert({ order_id, amount: order.total, method: provider, status: "pending" })
    .select("id")
    .single();
  const reference = `${order.code}-${payment?.id ?? Date.now()}`;
  const callback = `${SITE}/customer/orders/${order_id}?paid=1`;

  let authorization_url: string | null = null;

  if (provider === "flutterwave") {
    const KEY = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!KEY) return json({ error: "Flutterwave not configured" }, 400);
    const res = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: reference,
        amount: Number(order.total),
        currency: "NGN",
        redirect_url: callback,
        customer: { email, name: (order as any).profiles?.full_name ?? "Customer" },
        meta: { order_id, payment_id: payment?.id },
      }),
    });
    const body = await res.json();
    if (!res.ok || body?.status !== "success") return json({ error: body?.message ?? "Flutterwave error" }, 502);
    authorization_url = body.data.link;
  } else {
    const KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!KEY) return json({ error: "Paystack not configured" }, 400);
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: Math.round(Number(order.total) * 100), // kobo
        reference,
        callback_url: callback,
        metadata: { order_id, payment_id: payment?.id },
      }),
    });
    const body = await res.json();
    if (!res.ok) return json({ error: body?.message ?? "Paystack error" }, 502);
    authorization_url = body.data.authorization_url;
  }

  await db.from("payments").update({ reference }).eq("id", payment?.id);
  return json({ authorization_url, reference, provider });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
