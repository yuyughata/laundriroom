import Link from "next/link";
import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { money, dateTime, STATUS_LABEL, statusChip } from "@/lib/format";
import type { OrderSummary } from "@/lib/database.types";

export default async function VendorQueue({ searchParams }: { searchParams: { branch?: string } }) {
  const ctx = await getVendorContext();
  const supabase = createClient();

  // Business-wide staff of a multi-branch business can narrow to one branch.
  const multi = !ctx.branchId && ctx.branches.filter((b) => b.active).length > 1;
  const branchFilter = multi && ctx.branches.some((b) => b.id === searchParams?.branch) ? searchParams.branch! : null;

  let q = supabase
    .from("order_summaries").select("*")
    .eq("vendor_id", ctx.vendorId);
  if (branchFilter) q = q.eq("branch_id", branchFilter);
  const { data } = await q
    .order("created_at", { ascending: false })
    .limit(100);

  const orders = (data ?? []) as OrderSummary[];
  const open = orders.filter((o) => !["closed", "cancelled"].includes(o.status));
  const incoming = open.filter((o) => ["awaiting_dropoff", "pickup_requested"].includes(o.status));
  const working = open.filter((o) => ["checked_in", "processing"].includes(o.status));
  const outbound = open.filter((o) => ["ready", "out_for_delivery", "awaiting_collection"].includes(o.status));

  return (
    <VendorShell active="/vendor/queue" vendorName={ctx.vendorName}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Order queue</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link href="/vendor/orders/new" className="btn-primary px-4 py-2 text-xs">New order</Link>
          <span className="chip-muted">{incoming.length} incoming</span>
          <span className="chip-ink">{working.length} in progress</span>
          <span className="chip-ok">{outbound.length} ready</span>
        </div>
      </div>

      {multi && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filter by branch">
          <Link href="/vendor/queue" className={branchFilter ? "chip-muted" : "chip-ink"}>All branches</Link>
          {ctx.branches.filter((b) => b.active).map((b) => (
            <Link key={b.id} href={`/vendor/queue?branch=${b.id}`} className={branchFilter === b.id ? "chip-ink" : "chip-muted"}>{b.name}</Link>
          ))}
        </nav>
      )}

      <Column title="New & incoming" orders={incoming} empty="No new requests." highlight showBranch={multi && !branchFilter} />
      <Column title="In progress" orders={working} empty="Nothing being processed." showBranch={multi && !branchFilter} />
      <Column title="Ready to hand over" orders={outbound} empty="Nothing ready yet." showBranch={multi && !branchFilter} />
    </VendorShell>
  );
}

function Column({ title, orders, empty, highlight, showBranch }: {
  title: string; orders: OrderSummary[]; empty: string; highlight?: boolean; showBranch?: boolean;
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
              <p className="mt-1 text-sm text-slate">{o.customer_name}{showBranch && o.branch_name ? ` · ${o.branch_name}` : ""}</p>
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
