import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WashDryEditor } from "./ServicesClient";

export default async function AdminServices() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: settings }, { data: plan }] = await Promise.all([
    supabase.from("platform_settings").select("wash_dry_price, wash_dry_min_items").eq("id", true).maybeSingle(),
    supabase.from("vendor_plans").select("commission_rate").eq("is_default", true).limit(1).maybeSingle(),
  ]);
  const wd = (settings ?? { wash_dry_price: 0, wash_dry_min_items: 0 }) as { wash_dry_price: number; wash_dry_min_items: number };
  const commission = Number((plan as { commission_rate?: number } | null)?.commission_rate ?? 0);

  return (
    <AdminShell active="/admin/services" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Services & extras</h1>
      <p className="mt-1 text-sm text-slate">
        Premium orders unlock these extras. The express and premium markups and the
        non-collection penalty are set under <span className="font-medium text-ink">Fees &amp; charges</span>.
      </p>

      <div className="mt-8">
        <h2 className="font-display text-lg text-ink">Wash &amp; dry only (bulk)</h2>
        <p className="text-xs text-slate">
          A flat-rate service for bulk, family-size loads — washed and dried only, no pressing or folding.
          Set the price the laundry receives and the number of clothes that qualify. Laundries choose whether
          to offer it. Set the price to ₦0 to turn it off everywhere.
        </p>
        <WashDryEditor price={wd.wash_dry_price} minItems={wd.wash_dry_min_items} commission={commission} />
      </div>

      <div className="mt-8">
        <h2 className="font-display text-lg text-ink">Premium extras</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          Premium extras are now set by each laundry in their own dashboard
          (Vendor → Items → Premium extras), so they can offer and price the
          high-end add-ons they actually provide — as a flat price or a
          percentage of the order. There&apos;s no global list to manage here.
        </p>
      </div>
    </AdminShell>
  );
}
