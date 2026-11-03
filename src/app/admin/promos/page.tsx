import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewPromo, PromoRow } from "./PromosClient";
import { BulkDiscount } from "./BulkDiscount";
import type { PromoCode } from "@/lib/database.types";

export default async function AdminPromos() {
  const profile = await requireProfile();
  const supabase = createClient();
  const [{ data }, { data: vendors }, { data: settings }] = await Promise.all([
    supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
    supabase.from("vendors").select("id, name"),
    supabase.from("platform_settings").select("bulk_min_items, bulk_discount_pct").eq("id", true).maybeSingle(),
  ]);
  const promos = (data ?? []) as PromoCode[];
  const s = settings as { bulk_min_items?: number; bulk_discount_pct?: number } | null;
  const vmap = new Map(((vendors ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name]));

  return (
    <AdminShell active="/admin/promos" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Promo codes</h1>
        <NewPromo />
      </div>
      <p className="mt-1 text-sm text-slate">
        Admin promo codes are <span className="font-medium text-ink">platform-funded</span> (they don&apos;t reduce vendor payouts).
        Vendor-created promos are vendor-funded. 🎁 marks auto-issued referral rewards.
      </p>

      <div className="mt-6">
        <BulkDiscount
          minItems={Number(s?.bulk_min_items ?? 0)}
          pct={Math.round(Number(s?.bulk_discount_pct ?? 0) * 100 * 100) / 100}
        />
      </div>

      <h2 className="mt-8 font-display text-lg text-ink">Promo codes</h2>
      <div className="mt-3 table-scroll rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Funded by</th>
              <th className="px-4 py-3">Used</th><th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {promos.map((p) => <PromoRow key={p.id} promo={p} fundedBy={p.vendor_id ? (vmap.get(p.vendor_id) ?? "Vendor") : "Platform"} />)}
            {promos.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate">No promo codes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
