// deno-lint-ignore-file no-explicit-any
// ============================================================================
// process-payouts — send vendor payouts as Paystack transfers.
//
// Called three ways:
//   • Straight after reconciliation: when an order is completed and paid the
//     database creates the payout and (if it's due now — the default) calls
//     this function for that payout at once (migration 0032). Body
//     { payout_id }, header x-cron-secret.
//   • Hourly safety net (pg_cron, migration 0019): no body → every 'due'
//     payout whose due_at has passed (retries, or a hold window if an admin
//     set one). Header x-cron-secret.
//   • Admin "Release" (app server): { payout_id, release: true } with
//     Authorization: Bearer <service-role key>. Sends a 'due' or 'held'
//     payout now, ignoring its due time.
//
// For each payout: claim it (due/held → processing, so two runs can never
// send it twice), make sure the vendor has a Paystack recipient, check the
// balance, and initiate the transfer (reference = payout id, idempotent at
// Paystack too). paystack-webhook settles it to 'sent', or back to 'due'.
// Anything that stops a transfer (no bank account, short balance, Paystack
// error) puts the payout back to 'due' with a failure_reason; the hourly run
// retries it.
//
// Secrets: PAYSTACK_SECRET_KEY, CRON_SECRET (and the auto SUPABASE_* vars).
// Deploy:  supabase functions deploy process-payouts --no-verify-jwt
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRecipient, initiateTransfer, getBalanceNGN } from "../_shared/paystack.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET");

  // Who's calling: the database (shared cron secret) or the app server on an
  // admin's behalf (service-role key). Fail closed otherwise.
  const viaCron = !!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;
  const viaApp = !!SERVICE_KEY && req.headers.get("Authorization") === `Bearer ${SERVICE_KEY}`;
  if (!viaCron && !viaApp) {
    if (!CRON_SECRET && req.headers.get("x-cron-secret")) return json({ error: "CRON_SECRET not set" }, 503);
    return json({ error: "unauthorized" }, 401);
  }

  const PAYSTACK = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!PAYSTACK) return json({ error: "PAYSTACK_SECRET_KEY not set" }, 400);

  const body = await req.json().catch(() => ({} as any));
  const payoutId = typeof body?.payout_id === "string" ? body.payout_id : null;
  if (payoutId && !UUID.test(payoutId)) return json({ error: "bad payout_id" }, 400);
  // Only an admin release may send a held payout, or one before its due time.
  const release = viaApp && body?.release === true && !!payoutId;

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Which payouts to send.
  let q = db.from("payouts").select("id, vendor_id, net, status, due_at");
  if (payoutId) {
    q = q.eq("id", payoutId).in("status", release ? ["due", "held"] : ["due"]);
    if (!release) q = q.lte("due_at", new Date().toISOString());
  } else {
    q = q.eq("status", "due").lte("due_at", new Date().toISOString()).order("due_at", { ascending: true }).limit(50);
  }
  const { data: candidates, error: qErr } = await q;
  if (qErr) return json({ error: qErr.message }, 500);
  if (!candidates?.length) {
    return json(payoutId
      ? { processed: 0, message: release ? "payout is not due or held (already sent or in progress?)" : "payout not due" }
      : { processed: 0, message: "nothing due" }, payoutId && release ? 409 : 200);
  }

  let balance = 0;
  try { balance = await getBalanceNGN(PAYSTACK); }
  catch (e) { return json({ error: `balance check failed: ${(e as Error).message}` }, 502); }

  const results: any[] = [];

  for (const p of candidates as any[]) {
    const net = Number(p.net);

    // Claim it. If another run got there first, the update matches nothing.
    const { data: claimed } = await db.from("payouts")
      .update({ status: "processing", processed_at: new Date().toISOString(), failure_reason: null })
      .eq("id", p.id).in("status", release ? ["due", "held"] : ["due"])
      .select("id").maybeSingle();
    if (!claimed) { results.push({ id: p.id, skipped: "already being processed" }); continue; }

    // Something stops this transfer: back to 'due' with the reason; retried hourly.
    const giveBack = async (reason: string) => {
      await db.from("payouts").update({ status: "due", failure_reason: reason, processed_at: null }).eq("id", p.id);
    };

    const { data: acct } = await db
      .from("vendor_payout_accounts").select("*").eq("vendor_id", p.vendor_id).maybeSingle();
    if (!acct) {
      await giveBack("No payout account on file");
      results.push({ id: p.id, status: "due", reason: "No payout account on file" });
      continue;
    }
    if (net <= 0) {
      // Nothing to transfer (e.g. a fully vendor-funded discount): settle it.
      await db.from("payouts").update({ status: "sent", sent_at: new Date().toISOString(), reference: p.id }).eq("id", p.id);
      results.push({ id: p.id, status: "sent", reason: "nothing to transfer" });
      continue;
    }
    if (balance < net) {
      await giveBack("Insufficient platform balance");
      results.push({ id: p.id, status: "due", reason: "Insufficient platform balance" });
      continue;
    }

    try {
      let recipient = (acct as any).recipient_code as string | null;
      if (!recipient) {
        recipient = await createRecipient(
          PAYSTACK, (acct as any).account_name || "Vendor", (acct as any).account_number, (acct as any).bank_code,
        );
        await db.from("vendor_payout_accounts").update({ recipient_code: recipient }).eq("vendor_id", p.vendor_id);
      }

      const t = await initiateTransfer(PAYSTACK, recipient, net, p.id, `laundriroom payout ${p.id}`);
      await db.from("payouts").update({
        transfer_code: t.transfer_code,
        reference: p.id,
        // A transfer waiting for an OTP needs someone to turn OTP off in Paystack.
        failure_reason: t.status === "otp"
          ? "Paystack is waiting for an OTP: turn off the transfer OTP in Paystack settings"
          : null,
      }).eq("id", p.id);
      balance -= net;
      results.push({ id: p.id, status: "processing", paystack: t.status });
    } catch (e) {
      const reason = (e as Error).message || "transfer failed";
      await giveBack(reason);
      results.push({ id: p.id, status: "due", reason });
    }
  }

  return json({ processed: results.length, results }, 200);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
