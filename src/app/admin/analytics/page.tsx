import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

type Analytics = {
  revenue: number; orders_closed: number; avg_turnaround_hours: number | null;
  repeat_rate: number; top_items: { name: string; qty: number }[];
};

export default async function AdminAnalytics() {
  const profile = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase.rpc("get_analytics" as never);
  const a = (data as Analytics | null) ?? null;

  return (
    <AdminShell active="/admin/analytics" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Analytics</h1>
      <p className="mt-1 text-sm text-slate">Revenue, turnaround, top items and repeat rate across the platform.</p>

      {!a ? (
        <div className="mt-4 rounded-card border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          Analytics unavailable — ensure the database is connected and migration 0011 is applied.
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Revenue collected" value={money(a.revenue)} sub="paid in full" />
            <Stat label="Completed orders" value={String(a.orders_closed)} sub="all time" />
            <Stat label="Avg turnaround" value={a.avg_turnaround_hours != null ? `${a.avg_turnaround_hours} h` : "—"} sub="check-in → completed" />
            <Stat label="Repeat rate" value={`${a.repeat_rate}%`} sub="customers with >1 order" />
          </div>

          <section className="mt-8 max-w-lg">
            <h2 className="font-display text-lg text-ink">Top items</h2>
            <div className="mt-3 card p-4">
              {a.top_items.length === 0 ? (
                <p className="text-sm text-slate">No items yet.</p>
              ) : a.top_items.map((t) => {
                const max = a.top_items[0].qty || 1;
                return (
                  <div key={t.name} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="w-28 shrink-0 text-ink">{t.name}</span>
                    <div className="h-2.5 flex-1 rounded-pill bg-ink/10">
                      <div className="h-2.5 rounded-pill bg-champagne" style={{ width: `${Math.round((t.qty / max) * 100)}%` }} />
                    </div>
                    <span className="w-10 text-right text-slate">{t.qty}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
      <p className="text-xs text-slate">{sub}</p>
    </div>
  );
}
