import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PlatformRatesEditor, DeliveryFeeEditor, OtherChargesEditor, VendorRatesRow } from "./FeesClient";
import type { Vendor } from "@/lib/database.types";

const pct = (frac: unknown) => Math.round(Number(frac ?? 0) * 10000) / 100; // 0.15 → 15

export default async function AdminFees() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: s }, { data: plan }, { data: fee }, { data: vendors }] = await Promise.all([
    supabase.from("platform_settings")
      .select("express_pct, premium_pct, noncollection_penalty_pct, referral_reward").eq("id", true).maybeSingle(),
    supabase.from("vendor_plans").select("commission_rate").eq("is_default", true).limit(1).maybeSingle(),
    supabase.from("delivery_fee_rules").select("flat_amount").eq("scope", "global").limit(1).maybeSingle(),
    supabase.from("vendors").select("*").neq("status", "rejected").order("name"),
  ]);

  const settings = s as { express_pct: number; premium_pct: number; noncollection_penalty_pct: number; referral_reward: number } | null;
  const defaults = {
    commission: pct((plan as { commission_rate?: number } | null)?.commission_rate),
    express: pct(settings?.express_pct),
    premium: pct(settings?.premium_pct),
  };
  const list = (vendors ?? []) as Vendor[];
  const customCount = list.filter((v) =>
    v.commission_rate_override != null || v.express_pct_override != null || v.premium_pct_override != null).length;

  return (
    <AdminShell active="/admin/fees" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Fees & charges</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        One set of rates applies to every vendor. Override them for a specific vendor below — leave a box blank to
        use the platform rate. Standard orders stay at the vendor&apos;s price; the platform earns the commission plus
        any express or premium markup. Premium extras are set under{" "}
        <span className="font-medium text-ink">Services &amp; extras</span>.
      </p>

      <section className="card mt-6 max-w-4xl p-6">
        <h2 className="font-display text-lg text-ink">Platform rates</h2>
        <p className="mb-5 text-xs text-slate">The default for every vendor.</p>
        <PlatformRatesEditor commissionPct={defaults.commission} expressPct={defaults.express} premiumPct={defaults.premium} />
      </section>

      <section className="card mt-6 max-w-4xl p-6">
        <h2 className="font-display text-lg text-ink">Delivery & other charges</h2>
        <div className="mt-5 space-y-6">
          <DeliveryFeeEditor current={Number((fee as { flat_amount?: number } | null)?.flat_amount ?? 0)} />
          <OtherChargesEditor
            penaltyPct={pct(settings?.noncollection_penalty_pct)}
            referralReward={Number(settings?.referral_reward ?? 0)} />
        </div>
      </section>

      <section id="vendor-rates" className="mt-8 max-w-5xl">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg text-ink">Vendor rates</h2>
            <p className="text-xs text-slate">
              Set a different commission, express or premium rate for a vendor. Blank = platform rate (shown in grey).
            </p>
          </div>
          <span className="chip-muted">{customCount} custom</span>
        </div>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs text-slate">
              <tr>
                <th className="px-3 py-3">Vendor</th>
                <th className="px-3 py-3">Commission</th>
                <th className="px-3 py-3">Express</th>
                <th className="px-3 py-3">Premium</th>
                <th className="px-3 py-3">Rates</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <VendorRatesRow key={v.id} vendorId={v.id} name={v.name} status={v.status}
                  commission={v.commission_rate_override == null ? null : pct(v.commission_rate_override)}
                  express={v.express_pct_override == null ? null : pct(v.express_pct_override)}
                  premium={v.premium_pct_override == null ? null : pct(v.premium_pct_override)}
                  defaults={defaults} />
              ))}
              {!list.length && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate">No vendors yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
