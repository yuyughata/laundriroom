import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewExtra, ExtraCard, WashDryEditor } from "./ServicesClient";
import type { ServiceExtra } from "@/lib/database.types";

export default async function AdminServices() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: extras }, { data: settings }, { data: plan }] = await Promise.all([
    supabase.from("service_extras").select("*").order("price"),
    supabase.from("platform_settings").select("wash_dry_price, wash_dry_min_items").eq("id", true).maybeSingle(),
    supabase.from("vendor_plans").select("commission_rate").eq("is_default", true).limit(1).maybeSingle(),
  ]);
  const list = (extras ?? []) as ServiceExtra[];
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

      <div className="mt-8 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-ink">Premium extras</h2>
          <p className="text-xs text-slate">High-end add-ons offered on premium orders.</p>
        </div>
        <NewExtra />
      </div>

      {list.length === 0 ? (
        <p className="mt-4 text-sm text-slate">No extras yet. Add the first one above.</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => <ExtraCard key={e.id} extra={e} />)}
        </div>
      )}
    </AdminShell>
  );
}
