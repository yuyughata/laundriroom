import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money, dateTime, STATUS_LABEL, statusChip } from "@/lib/format";
import type { OrderSummary, OrderStatus } from "@/lib/database.types";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "processing", label: "In progress" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "closed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];
const OPEN_STATUSES: OrderStatus[] = ["awaiting_dropoff", "pickup_requested", "checked_in", "processing", "ready", "out_for_delivery", "awaiting_collection"];

export default async function AdminOrders({ searchParams }: { searchParams: { status?: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();
  const filter = searchParams.status ?? "all";

  let query = supabase.from("order_summaries").select("*").order("created_at", { ascending: false }).limit(200);
  if (filter === "open") query = query.in("status", OPEN_STATUSES);
  else if (filter !== "all") query = query.eq("status", filter as OrderStatus);

  const { data } = await query;
  const orders = (data ?? []) as OrderSummary[];
  const revenue = orders.filter((o) => o.is_paid).reduce((s, o) => s + Number(o.total), 0);

  return (
    <AdminShell active="/admin/orders" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Orders</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2 text-xs">
            <span className="chip-ink">{orders.length} shown</span>
            <span className="chip-ok">{money(revenue)} paid</span>
          </div>
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/orders" download>Orders PDF</a>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === "all" ? "/admin/orders" : `/admin/orders?status=${f.key}`}
            className={`rounded-pill px-3 py-1.5 text-xs ${
              filter === f.key ? "bg-ink text-ivory" : "bg-white text-ink border border-ink/15 hover:bg-ink/5"}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 table-scroll rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-ink/5">
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${o.id}`} className="font-medium text-ink underline decoration-ink/20 underline-offset-2 hover:decoration-ink">{o.code}</Link>
                  <p className="text-xs text-slate">
                    {o.service_tier === "premium" ? "Premium" : "Standard"}
                    {o.turnaround === "express" ? " · Express" : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate">
                  {o.vendor_name}
                  {o.branch_name && o.branch_name !== o.vendor_name && <span className="block text-xs">{o.branch_name}</span>}
                </td>
                <td className="px-4 py-3 text-slate">{o.customer_name}</td>
                <td className="px-4 py-3 text-slate">{o.item_count}</td>
                <td className="px-4 py-3">{money(o.total)}</td>
                <td className="px-4 py-3">
                  <span className={o.is_paid ? "chip-ok" : "chip-muted"}>{o.is_paid ? "Paid" : o.payment_timing === "on_delivery" ? "On delivery" : "Pending"}</span>
                </td>
                <td className="px-4 py-3"><span className={statusChip(o.status)}>{STATUS_LABEL[o.status as OrderStatus]}</span></td>
                <td className="px-4 py-3 text-slate">{dateTime(o.created_at)}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate">No orders match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
