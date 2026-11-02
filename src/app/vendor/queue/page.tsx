import Link from "next/link";
import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { money, dateTime, STATUS_LABEL, statusChip } from "@/lib/format";
import type { OrderSummary } from "@/lib/database.types";

export default async function VendorQueue() {
  const ctx = await getVendorContext();
  const supabase = createClient();

  const { data } = await supabase
    .from("order_summaries").select("*")
    .eq("vendor_id", ctx.vendorId)
    .order("created_at", { ascending: false })
    .limit(100);

  const orders = (data ?? []) as OrderSummary[];
  const open = orders.filter((o) => !["closed", "cancelled"].includes(o.status));
  const incoming = open.filter((o) => ["awaiting_dropoff", "pickup_requested"].includes(o.status));
  const working = open.filter((o) => ["checked_in", "processing"].includes(o.status));
  const outbound = open.filter((o) => ["ready", "out_for_delivery", "awaiting_collection"].includes(o.status));

  return (
    <VendorShell active="/vendor/queue" vendorName={ctx.vendorName}
      staffName={ctx.profile.full_name} staffRole={ctx.isManager ? "Manager" : "Attendant"}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Order queue</h1>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/vendor/orders/new" className="btn-primary px-4 py-2 text-xs">New order</Link>
          <span className="chip-muted">{incoming.length} incoming</span>
          <span className="chip-ink">{working.length} in progress</span>
          <span className="chip-ok">{outbound.length} ready</span>
        </div>
      </div>

      <Column title="New & incoming" orders={incoming} empty="No new requests." highlight />
      <Column title="In progress" orders={working} empty="Nothing being processed." />
      <Column title="Ready to hand over" orders={outbound} empty="Nothing ready yet." />
    </VendorShell>
  );
}

function Column({ title, orders, empty, highlight }: {
  title: string; orders: OrderSummary[]; empty: string; highlight?: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      {orders.length === 0 ? (
        <p className="mt-2 text-sm text-slate">{empty}</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {orders.map((o) => (
            <Link key={o.id} href={`/vendor/orders/${o.id}`}
              className={`card block p-4 ${highlight ? "border-warn/40" : ""}`}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{o.code}</p>
                <span className={statusChip(o.status)}>{STATUS_LABEL[o.status]}</span>
              </div>
              <p className="mt-1 text-sm text-slate">{o.customer_name}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-slate">
                <span>{o.entry_mode === "pickup" ? "Pickup" : "Drop-off"} · {o.return_mode === "delivery" ? "Deliver" : "Collect"}</span>
                <span>{o.item_count} items · {money(o.total)}</span>
              </div>
              <p className="mt-1 text-xs text-slate">{dateTime(o.created_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
