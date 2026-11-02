import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DeliveryFeeEditor, PlanCard } from "./PlansClient";
import type { VendorPlan } from "@/lib/database.types";

export default async function AdminPlans() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: plans }, { data: fee }] = await Promise.all([
    supabase.from("vendor_plans").select("*").eq("active", true).order("is_default", { ascending: false }),
    supabase.from("delivery_fee_rules").select("flat_amount").eq("scope", "global").limit(1).maybeSingle(),
  ]);

  return (
    <AdminShell active="/admin/plans" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Plans & fees</h1>
      <p className="mt-1 text-sm text-slate">
        laundriroom runs on commission. The rate is charged on the whole order total, delivery fee included.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {(plans as VendorPlan[] ?? []).map((p) => <PlanCard key={p.id} plan={p} />)}
      </div>

      <div className="mt-8 max-w-md">
        <DeliveryFeeEditor current={Number(fee?.flat_amount ?? 0)} />
      </div>
    </AdminShell>
  );
}
