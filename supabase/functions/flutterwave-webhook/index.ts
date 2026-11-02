// deno-lint-ignore-file no-explicit-any
// ============================================================================
// flutterwave-webhook — confirm a Flutterwave charge and settle the order.
// Verifies the "verif-hash" header against FLUTTERWAVE_WEBHOOK_HASH, then
// re-verifies the transaction with Flutterwave and marks the payment succeeded.
// The DB triggers close a pay-on-delivery order and schedule the payout.
//
// Deploy:  supabase functions deploy flutterwave-webhook --no-verify-jwt
// Secrets: FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_WEBHOOK_HASH
// Point your Flutterwave dashboard webhook at the function URL.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const SECRET = Deno.env.get("FLUTTERWAVE_SECRET_KEY")!;
  const HASH = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (req.headers.get("verif-hash") !== HASH) {
    return new Response("invalid signature", { status: 401 });
  }

  const event = await req.json().catch(() => null);
  const txRef = event?.data?.tx_ref as string;
  const txId = event?.data?.id;
  if (event?.event !== "charge.completed" || !txRef) return new Response("ignored", { status: 200 });

  // Re-verify with Flutterwave before trusting the webhook body.
  const vr = await fetch(`https://api.flutterwave.com/v3/transactions/${txId}/verify`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const verify = await vr.json();
  if (verify?.data?.status !== "successful") return new Response("not successful", { status: 200 });
  // The verified transaction must be this payment's, in NGN, for the full amount.
  if (verify.data.tx_ref !== txRef || verify.data.currency !== "NGN") {
    return new Response("reference mismatch", { status: 200 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: payment } = await db
    .from("payments").select("id, status, amount").eq("reference", txRef).maybeSingle();
  if (!payment) return new Response("payment not found", { status: 200 });
  if ((payment as any).status === "succeeded") return new Response("already processed", { status: 200 });
  if (Number(verify.data.amount) < Number((payment as any).amount)) {
    return new Response("amount short", { status: 200 });
  }

  await db.from("payments")
    .update({ status: "succeeded", paid_at: new Date().toISOString() })
    .eq("id", (payment as any).id);

  return new Response("ok", { status: 200 });
});
