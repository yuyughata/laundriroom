import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type VendorRow = {
  vendor_id: string; vendor_name: string; customers: number; orders: number;
  one_and_done: number; repeat_customers: number; lapsed_repeat: number;
  dormant_customers: number; one_and_done_pct: number;
};
type Leakage = {
  lapse_days: number;
  totals: { customers: number; one_and_done: number; one_and_done_pct: number; lapsed_repeat: number };
  vendors: VendorRow[];
};

/** Risk band for a vendor's one-and-done ratio. */
function riskChip(pct: number) {
  if (pct >= 60) return <span className="chip-warn">High</span>;
  if (pct >= 40) return <span className="chip-muted">Watch</span>;
  return <span className="chip-ok">Healthy</span>;
}

export default async function AdminLeakage() {
  const profile = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase.rpc("get_leakage_analytics" as never);
  const a = (data as Leakage | null) ?? null;

  return (
    <AdminShell active="/admin/leakage" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Leakage analytics</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        Signals that customers found through laundriroom may be transacting with a vendor
        off-platform. A high <span className="font-medium text-ink">one-and-done</span> rate
        (ordered once, never again) or many <span className="font-medium text-ink">lapsed repeat</span> customers
        (engaged, then went quiet for over {a?.lapse_days ?? 45} days) are the clearest tells.
        Treat these as leads to investigate, not proof.
      </p>

      {!a ? (
        <div className="mt-6 rounded-card border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          Leakage analytics unavailable — ensure the database is connected and migration 0016 is applied.
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs text-slate">Customers (platform-wide)</p>
              <p className="mt-1 font-display text-2xl text-ink">{a.totals.customers}</p>
              <p className="text-xs text-slate">with a completed order</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate">One-and-done rate</p>
              <p className="mt-1 font-display text-2xl text-ink">{a.totals.one_and_done_pct}%</p>
              <p className="text-xs text-slate">{a.totals.one_and_done} ordered once only</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate">Lapsed repeat customers</p>
              <p className="mt-1 font-display text-2xl text-ink">{a.totals.lapsed_repeat}</p>
              <p className="text-xs text-slate">repeat buyers gone quiet &gt;{a.lapse_days}d</p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-card border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-ink/5 text-left text-xs text-slate">
                <tr>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Customers</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Repeat</th>
                  <th className="px-4 py-3">One-and-done</th>
                  <th className="px-4 py-3">Lapsed repeat</th>
                  <th className="px-4 py-3">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {a.vendors.map((v) => (
                  <tr key={v.vendor_id}>
                    <td className="px-4 py-3 font-medium text-ink">{v.vendor_name}</td>
                    <td className="px-4 py-3 text-slate">{v.customers}</td>
                    <td className="px-4 py-3 text-slate">{v.orders}</td>
                    <td className="px-4 py-3 text-slate">{v.repeat_customers}</td>
                    <td className="px-4 py-3 text-ink">{v.one_and_done} <span className="text-slate">({v.one_and_done_pct}%)</span></td>
                    <td className="px-4 py-3">{v.lapsed_repeat > 0 ? <span className="text-warn">{v.lapsed_repeat}</span> : <span className="text-slate">0</span>}</td>
                    <td className="px-4 py-3">{riskChip(v.one_and_done_pct)}</td>
                  </tr>
                ))}
                {a.vendors.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate">No completed orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate">
            Sorted by highest one-and-done rate first. Low order counts are noisy — weight vendors with enough history.
          </p>
        </>
      )}
    </AdminShell>
  );
}
