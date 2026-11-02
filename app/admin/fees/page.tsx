import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FeesEditor } from "./FeesClient";

export default async function AdminFees() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: s } = await supabase
    .from("platform_settings")
    .select("express_pct, premium_pct, noncollection_penalty_pct, referral_reward")
    .eq("id", true).maybeSingle();

  return (
    <AdminShell active="/admin/fees" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Fees & charges</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        Standard orders stay at the vendor&apos;s usual price — the platform earns through the
        vendor&apos;s commission (a discounted rate), so the customer pays what they always did.
        Express and premium add a platform markup on top, which the platform keeps in full.
        Delivery fees are set under <span className="font-medium text-ink">Plans &amp; fees</span>,
        and premium extras under <span className="font-medium text-ink">Services &amp; extras</span>.
      </p>

      <div className="mt-6 max-w-2xl rounded-card border border-ink/10 bg-white p-6">
        <FeesEditor
          expressPct={Math.round(Number(s?.express_pct ?? 0) * 100)}
          premiumPct={Math.round(Number(s?.premium_pct ?? 0) * 100)}
          penaltyPct={Math.round(Number(s?.noncollection_penalty_pct ?? 0) * 100)}
          referralReward={Number((s as { referral_reward?: number } | null)?.referral_reward ?? 0)}
        />
      </div>
    </AdminShell>
  );
}
