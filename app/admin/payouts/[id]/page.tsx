import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money, dateTime, dateShort } from "@/lib/format";
import type { Payout, OrderSummary, Vendor } from "@/lib/database.types";

/** Payout reconciliation — the orders that make up a payout. */
export default async function PayoutDetail({ params }: { params: { id: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: payout } = await supabase.from("payouts").select("*").eq("id", params.id).maybeSingle();
  if (!payout) notFound();
  const p = payout as Payout;

  const [{ data: vendor }, { data: orders }] = await Promise.all([
    supabase.from("vendors").select("name, area, city").eq("id", p.vendor_id).maybeSingle(),
    p.order_ids.length
      ? supabase.from("order_summaries").select("*").in("id", p.order_ids)
      : Promise.resolve({ data: [] }),
  ]);
  const v = vendor as Pick<Vendor, "name" | "area" | "city"> | null;
  const os = (orders ?? []) as OrderSummary[];
  const vendorGross = os.reduce((s, o) => s + Number(o.total), 0);

  return (
    <AdminShell active="/admin/payouts" name={profile.full_name} role={profile.role}>
      <Link href="/admin/payouts" className="text-sm text-slate">← Payouts</Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl text-ink">Payout reconciliation</h1>
        <span className={p.status === "sent" ? "chip-ok" : p.status === "held" ? "chip-warn" : "chip-muted"}>{p.status}</span>
      </div>
      <p className="mt-1 text-sm text-slate">
        {v?.name} · due {dateTime(p.due_at)}{p.sent_at ? ` · sent ${dateTime(p.sent_at)}` : ""}
        {p.reference ? ` · ref ${p.reference}` : ""}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Gross" value={money(p.gross)} />
        <Stat label="Commission" value={`−${money(p.fee)}`} />
        <Stat label="Net payable" value={money(p.net)} strong />
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg text-ink">Orders in this payout ({os.length})</h2>
        <div className="mt-3 overflow-x-auto rounded-card border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs text-slate">
              <tr>
                <th className="px-4 py-2">Order</th><th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Closed</th><th className="px-4 py-2 text-right">Order total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {os.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-medium text-ink">{o.code}</td>
                  <td className="px-4 py-2 text-slate">{o.customer_name}</td>
                  <td className="px-4 py-2 text-slate">{dateShort(o.closed_at)}</td>
                  <td className="px-4 py-2 text-right">{money(o.total)}</td>
                </tr>
              ))}
              <tr className="bg-ink/5">
                <td className="px-4 py-2 font-medium text-ink" colSpan={3}>Vendor-entitled gross (items + extras + delivery)</td>
                <td className="px-4 py-2 text-right font-medium text-ink">{money(p.gross)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate">
          Order totals may exceed the vendor gross — platform markups (express/premium) and any penalty are kept by the platform and excluded from the payout. Shown order total sum: {money(vendorGross)}.
        </p>
      </section>
    </AdminShell>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate">{label}</p>
      <p className={`mt-1 font-display ${strong ? "text-3xl" : "text-2xl"} text-ink`}>{value}</p>
    </div>
  );
}
