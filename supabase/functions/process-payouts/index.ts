// deno-lint-ignore-file no-explicit-any
// ============================================================================
// process-payouts — initiate Paystack transfers for payouts that have fallen due.
//
// Runs on a schedule (see docs/CONNECT-DATABASE.md). For each payout with
// status 'due' and due_at <= now():
//   • ensure the vendor has a Paystack transfer recipient (create it lazily),
//   • check the platform balance covers the net amount,
//   • initiate the transfer (reference = payout id, so it's idempotent),
//   • move the payout to 'processing'. The paystack-webhook settles it to
//     'sent' or 'failed'.
// Transient problems (no bank account, short balance) leave the payout 'due'
// with a failure_reason, so the next run retries automatically.
//
// Protect it with a shared secret: send header `x-cron-secret: <CRON_SECRET>`.
// Deploy:  supabase functions deploy process-payouts
// Secrets: PAYSTACK_SECRET_KEY, CRON_SECRET (and the auto SUPABASE_* vars).
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRecipient, initiateTransfer, getBalanceNGN } from "../_shared/paystack.ts";

Deno.serve(async (req: Request) => {
  // Fail closed: without CRON_SECRET set, nobody can trigger a payout run.
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ error: "CRON_SECRET not set" }, 503);
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const PAYSTACK = Deno.env.get("PAYSTACK_SECRET_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!PAYSTACK) return json({ error: "PAYSTACK_SECRET_KEY not set" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Due payouts, oldest first, capped per run.
  const { data: due } = await db
    .from("payouts")
    .select("id, vendor_id, net, status")
    .eq("status", "due")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(50);

  if (!due?.length) return json({ processed: 0, message: "nothing due" }, 200);

  let balance = 0;
  try { balance = await getBalanceNGN(PAYSTACK); }
  catch (e) { return json({ error: `balance check failed: ${(e as Error).message}` }, 502); }

  const results: any[] = [];

  for (const p of due as any[]) {
    const net = Number(p.net);

    // Vendor bank account?
    const { data: acct } = await db
      .from("vendor_payout_accounts").select("*").eq("vendor_id", p.vendor_id).maybeSingle();
    if (!acct) {
      await db.from("payouts").update({ failure_reason: "No payout account on file" }).eq("id", p.id);
      results.push({ id: p.id, skipped: "no account" });
      continue;
    }

    if (balance < net) {
      await db.from("payouts").update({ failure_reason: "Insufficient platform balance" }).eq("id", p.id);
      results.push({ id: p.id, skipped: "insufficient balance" });
      continue;
    }

    try {
      // Ensure a recipient exists.
      let recipient = (acct as any).recipient_code as string | null;
      if (!recipient) {
        recipient = await createRecipient(
          PAYSTACK,
          (acct as any).account_name || "Vendor",
          (acct as any).account_number,
          (acct as any).bank_code,
        );
        await db.from("vendor_payout_accounts").update({ recipient_code: recipient }).eq("vendor_id", p.vendor_id);
      }

      const t = await initiateTransfer(PAYSTACK, recipient, net, p.id, `laundriroom payout ${p.id}`);
      await db.from("payouts").update({
        status: "processing",
        transfer_code: t.transfer_code,
        reference: p.id,
        processed_at: new Date().toISOString(),
        failure_reason: null,
      }).eq("id", p.id);
      balance -= net;
      results.push({ id: p.id, status: t.status });
    } catch (e) {
      // Hard failure for this payout; leave it 'due' to retry, record why.
      await db.from("payouts").update({ failure_reason: (e as Error).message }).eq("id", p.id);
      results.push({ id: p.id, error: (e as Error).message });
    }
  }

  return json({ processed: results.length, results }, 200);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
