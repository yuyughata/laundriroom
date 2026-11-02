// deno-lint-ignore-file no-explicit-any
// ============================================================================
// paystack-webhook — confirm a Paystack charge and settle the order.
// Verifies the x-paystack-signature (HMAC-SHA512 of the raw body with the
// secret key), then marks the payment succeeded. The database trigger closes a
// pay-on-delivery order and schedules the vendor payout.
//
// Deploy:  supabase functions deploy paystack-webhook --no-verify-jwt
// Point your Paystack dashboard webhook at the function URL.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

Deno.serve(async (req: Request) => {
  const PAYSTACK = Deno.env.get("PAYSTACK_SECRET_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", PAYSTACK).update(raw).digest("hex");
  if (signature !== expected) return new Response("invalid signature", { status: 401 });

  const event = JSON.parse(raw);
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const type = event?.event as string;

  // ── Incoming charge: settle the order's payment ──────────────────────────
  if (type === "charge.success") {
    const reference = event.data?.reference as string;
    const { data: payment } = await db
      .from("payments").select("id, order_id, status").eq("reference", reference).maybeSingle();
    if (!payment) return new Response("payment not found", { status: 200 });
    if (payment.status === "succeeded") return new Response("already processed", { status: 200 });

    await db.from("payments")
      .update({ status: "succeeded", paid_at: new Date().toISOString() })
      .eq("id", (payment as any).id);
    // triggers close the order (if pay-on-delivery) and schedule the payout.
    return new Response("ok", { status: 200 });
  }

  // ── Outgoing transfer: settle the vendor payout ──────────────────────────
  // Our transfer reference is the payout id.
  if (type === "transfer.success" || type === "transfer.failed" || type === "transfer.reversed") {
    const reference = event.data?.reference as string;
    if (!reference) return new Response("no reference", { status: 200 });

    if (type === "transfer.success") {
      await db.from("payouts").update({
        status: "sent", sent_at: new Date().toISOString(), failure_reason: null,
      }).eq("reference", reference);
    } else {
      // failed or reversed → back to 'due' so the next run retries, with the reason.
      await db.from("payouts").update({
        status: "due",
        failure_reason: event.data?.reason || type,
        transfer_code: null,
      }).eq("reference", reference);
    }
    return new Response("ok", { status: 200 });
  }

  return new Response("ignored", { status: 200 });
});
