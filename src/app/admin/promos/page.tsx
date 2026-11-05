import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewPromo, PromoRow } from "./PromosClient";
import { BulkDiscount } from "./BulkDiscount";
import { QrCard } from "@/components/promo/QrCard";
import { siteUrl } from "@/lib/vendorProfile";
import { promoOrderUrl } from "@/lib/promoLinks";
import type { PromoCode } from "@/lib/database.types";

export default async function AdminPromos() {
  const profile = await requireProfile();
  const supabase = createClient();
  const [{ data }, { data: vendors }, { data: settings }] = await Promise.all([
    supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
    supabase.from("vendors").select("id, name, slug"),
    supabase.from("platform_settings").select("bulk_min_items, bulk_discount_pct").eq("id", true).maybeSingle(),
  ]);
  const promos = (data ?? []) as PromoCode[];
  const s = settings as { bulk_min_items?: number; bulk_discount_pct?: number } | null;
  const vlist = (vendors ?? []) as { id: string; name: string; slug: string | null }[];
  const vmap = new Map(vlist.map((v) => [v.id, v.name]));
  const slugOf = new Map(vlist.map((v) => [v.id, v.slug]));
  const site = siteUrl();

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

      <section className="mt-6">
        <h2 className="font-display text-lg text-ink">QR codes</h2>
        <p className="mt-1 text-sm text-slate">
          Print these on flyers, posters and receipts. Each promo code has its own QR too — open <span className="font-medium text-ink">QR code</span> on its row.
        </p>
        <div className="mt-3 max-w-2xl">
          <QrCard title="laundriroom website" url={site} fileName="laundriroom-website-qr"
            note="Opens the laundriroom home page, where people sign up or sign in." />
        </div>
      </section>

      <div className="mt-8">
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
              <th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {promos.map((p) => <PromoRow key={p.id} promo={p} fundedBy={p.vendor_id ? (vmap.get(p.vendor_id) ?? "Vendor") : "Platform"}
              qrUrl={promoOrderUrl(site, p.code, p.vendor_id ? slugOf.get(p.vendor_id) : null)} />)}
            {promos.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate">No promo codes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
