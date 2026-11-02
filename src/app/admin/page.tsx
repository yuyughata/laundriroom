import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money, dateTime, STATUS_LABEL, statusChip } from "@/lib/format";
import type { OrderSummary, Vendor } from "@/lib/database.types";

type Metrics = {
  vendors_total: number; vendors_pending: number; vendors_verified: number;
  customers: number; staff: number;
  orders_total: number; orders_open: number; orders_closed: number; orders_today: number;
  revenue_collected: number; payouts_due_net: number; payouts_due_count: number;
};

export default async function AdminHome() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: metricsData } = await supabase.rpc("get_platform_metrics" as never);
  const m = (metricsData as Metrics | null) ?? null;

  const [{ data: pending }, { data: recent }] = await Promise.all([
    supabase.from("vendors").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
    supabase.from("order_summaries").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  const pendingVendors = (pending ?? []) as Vendor[];
  const recentOrders = (recent ?? []) as OrderSummary[];

  return (
    <AdminShell active="/admin" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Platform overview</h1>
          <p className="mt-1 text-sm text-slate">Live totals across every vendor.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/orders" download>Orders PDF</a>
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/transactions" download>Transactions PDF</a>
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/payouts" download>Payouts PDF</a>
        </div>
      </div>

      {!m && (
        <div className="mt-4 rounded-card border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          Metrics are unavailable. Make sure the database is connected and migration 0007 is applied.
        </div>
      )}

      {m && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Orders today" value={m.orders_today} sub={`${m.orders_total} all time`} href="/admin/orders" />
            <Stat label="Open orders" value={m.orders_open} sub={`${m.orders_closed} completed`} href="/admin/orders?status=open" />
            <Stat label="Revenue collected" value={money(m.revenue_collected)} sub="paid in full" money />
            <Stat label="Payouts due" value={money(m.payouts_due_net)} sub={`${m.payouts_due_count} vendors`} href="/admin/payouts" money warn={m.payouts_due_count > 0} />
            <Stat label="Vendors" value={m.vendors_total} sub={`${m.vendors_verified} verified`} href="/admin/vendors" />
            <Stat label="Pending verification" value={m.vendors_pending} sub="awaiting review" href="/admin/vendors" warn={m.vendors_pending > 0} />
            <Stat label="Customers" value={m.customers} sub="registered" href="/admin/users?role=customer" />
            <Stat label="Staff" value={m.staff} sub="attendants, managers, riders" href="/admin/users?role=staff" />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg text-ink">Pending vendor verification</h2>
                <Link href="/admin/vendors" className="text-xs text-slate underline">All vendors</Link>
              </div>
              <div className="mt-3 space-y-2">
                {pendingVendors.length === 0 ? (
                  <p className="text-sm text-slate">Nothing waiting for review.</p>
                ) : pendingVendors.map((v) => (
                  <Link key={v.id} href="/admin/vendors" className="card flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{v.name}</p>
                      <p className="text-xs text-slate">{[v.area, v.city].filter(Boolean).join(", ") || "—"}</p>
                    </div>
                    <span className="chip-warn">Pending</span>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg text-ink">Recent orders</h2>
                <Link href="/admin/orders" className="text-xs text-slate underline">All orders</Link>
              </div>
              <div className="mt-3 space-y-2">
                {recentOrders.length === 0 ? (
                  <p className="text-sm text-slate">No orders yet.</p>
                ) : recentOrders.map((o) => (
                  <div key={o.id} className="card flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{o.code}</p>
                      <p className="text-xs text-slate">{o.vendor_name} · {dateTime(o.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <span className={statusChip(o.status)}>{STATUS_LABEL[o.status]}</span>
                      <p className="mt-1 text-xs text-ink">{money(o.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Stat({
  label, value, sub, href, money: isMoney, warn,
}: { label: string; value: string | number; sub: string; href?: string; money?: boolean; warn?: boolean }) {
  const body = (
    <div className={`card h-full p-4 ${warn ? "border-warn/40" : ""}`}>
      <p className="text-xs text-slate">{label}</p>
      <p className={`mt-1 font-display ${isMoney ? "text-xl" : "text-3xl"} text-ink`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate">{sub}</p>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
