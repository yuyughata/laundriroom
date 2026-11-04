import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { NewVendorPromo, VendorPromoRow } from "./VendorPromos";
import { QrCard } from "@/components/promo/QrCard";
import { siteUrl, vendorProfileUrl } from "@/lib/vendorProfile";
import { promoOrderUrl } from "@/lib/promoLinks";
import type { PromoCode } from "@/lib/database.types";

export default async function VendorPromosPage() {
  const ctx = await getVendorContext();
  const supabase = createClient();
  const { data } = await supabase.from("promo_codes").select("*")
    .eq("vendor_id", ctx.vendorId).order("created_at", { ascending: false });
  const promos = (data ?? []) as PromoCode[];
  const { data: v } = await supabase.from("vendors").select("slug").eq("id", ctx.vendorId).maybeSingle();
  const slug = (v as { slug?: string | null } | null)?.slug ?? null;
  const site = siteUrl();

  return (
    <VendorShell active="/vendor/promos" vendorName={ctx.vendorName} isManager={ctx.isManager}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Promos & campaigns</h1>
        <NewVendorPromo vendorId={ctx.vendorId} canManage={ctx.isManager} />
      </div>
      <p className="mt-1 text-sm text-slate">
        Run your own discounts. These are <span className="font-medium text-ink">vendor-funded</span> — the discount comes
        out of your payout. Platform promos set by the admin don&apos;t affect your pay.
      </p>
      {!ctx.isManager && <p className="mt-1 text-xs text-slate">Only a manager can create promos.</p>}

      {slug && (
        <section className="mt-6 max-w-2xl">
          <QrCard title="Your laundriroom page" url={vendorProfileUrl(slug)} fileName={`${slug}-page-qr`}
            note="Opens your page with your prices, reviews and an Order button. Each promo below has its own QR too." />
        </section>
      )}

      <div className="mt-6 table-scroll rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Used</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {promos.map((p) => <VendorPromoRow key={p.id} promo={p} canManage={ctx.isManager} qrUrl={promoOrderUrl(site, p.code, slug)} />)}
            {promos.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate">No promos yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </VendorShell>
  );
}
