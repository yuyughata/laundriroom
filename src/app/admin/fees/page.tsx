import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PlatformRatesEditor, DeliveryFeeEditor, OtherChargesEditor, PayoutDelayEditor, DeliveryPricingEditor } from "./FeesClient";
import { loadPricing } from "@/lib/deliveryPricing";
import { mapsConfigured } from "@/lib/maps";

const pct = (frac: unknown) => Math.round(Number(frac ?? 0) * 10000) / 100; // 0.15 → 15

export default async function AdminFees() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: s }, { data: plan }, { data: fee }, pricing] = await Promise.all([
    supabase.from("platform_settings")
      .select("express_pct, premium_pct, noncollection_penalty_pct, referral_reward, payout_delay_hours").eq("id", true).maybeSingle(),
    supabase.from("vendor_plans").select("commission_rate").eq("is_default", true).limit(1).maybeSingle(),
    supabase.from("delivery_fee_rules").select("flat_amount").eq("scope", "global").limit(1).maybeSingle(),
    loadPricing(supabase),
  ]);

  const settings = s as { express_pct: number; premium_pct: number; noncollection_penalty_pct: number; referral_reward: number; payout_delay_hours: number } | null;
  const rates = {
    commission: pct((plan as { commission_rate?: number } | null)?.commission_rate),
    express: pct(settings?.express_pct),
    premium: pct(settings?.premium_pct),
  };
  return (
    <AdminShell active="/admin/fees" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Fees & charges</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        One set of rates applies to every vendor. The commission is added on top of each vendor&apos;s item prices, so
        the customer pays the vendor&apos;s price plus commission and the vendor is paid their own price in full. On an
        express order the express charge replaces the commission. Premium is added on top either way. Premium extras are set under{" "}
        <span className="font-medium text-ink">Services &amp; extras</span>.
      </p>

      <section className="card mt-6 max-w-4xl p-6">
        <h2 className="font-display text-lg text-ink">Platform rates</h2>
        <p className="mb-5 text-xs text-slate">Applies to all vendors.</p>
        <PlatformRatesEditor commissionPct={rates.commission} expressPct={rates.express} premiumPct={rates.premium} />
      </section>

      <section className="card mt-6 max-w-4xl p-6">
        <h2 className="font-display text-lg text-ink">Delivery pricing</h2>
        <p className="mb-5 text-xs text-slate">How the delivery fee is worked out when a customer chooses delivery.</p>
        <DeliveryPricingEditor mode={pricing.mode} perKm={pricing.perKm} base={pricing.base} min={pricing.min}
          flat={pricing.flat} mapsReady={mapsConfigured()} />
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

      <section className="card mt-6 max-w-4xl p-6">
        <h2 className="font-display text-lg text-ink">Vendor payouts</h2>
        <p className="mb-5 text-xs text-slate">When vendors receive their share through Paystack.</p>
        <PayoutDelayEditor hours={Number(settings?.payout_delay_hours ?? 0)} />
      </section>
    </AdminShell>
  );
}
