import { CustomerShell } from "@/components/shells/CustomerShell";
import { requireProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/ui/SignOutButton";

export default async function AccountPage() {
  const profile = await requireProfile();

  return (
    <CustomerShell active="/customer/account">
      <h1 className="font-display text-2xl text-ink">Account</h1>

      <section className="card mt-6 divide-y divide-ink/5">
        <Field label="Name" value={profile.full_name || "—"} />
        <Field label="Email" value={profile.email || "—"}
          badge={profile.email_verified ? "Verified" : "Unverified"}
          badgeClass={profile.email_verified ? "chip-ok" : "chip-warn"} />
        <Field label="Phone" value={profile.phone || "—"} />
      </section>

      {!profile.email_verified && (
        <p className="mt-4 text-xs text-slate">
          We&apos;ll keep reminding you to verify your email until it&apos;s confirmed.
        </p>
      )}

      {profile.referral_code && (
        <section className="mt-8">
          <h2 className="font-display text-lg text-ink">Refer friends</h2>
          <p className="text-xs text-slate">Share your code. When a friend signs up and completes their first order, you get a reward.</p>
          <div className="mt-3 card flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-slate">Your referral code</p>
              <p className="font-display text-xl tracking-widest text-ink">{profile.referral_code}</p>
            </div>
            <span className="chip-ink">🎁 Rewards</span>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg text-ink">Reports</h2>
        <p className="text-xs text-slate">Download a PDF of your activity.</p>
        <div className="mt-3 grid gap-2">
          <a className="btn-ghost justify-between" href="/api/reports/orders" download>
            Order history <span className="text-xs text-slate">PDF</span>
          </a>
          <a className="btn-ghost justify-between" href="/api/reports/transactions" download>
            Transaction history <span className="text-xs text-slate">PDF</span>
          </a>
        </div>
      </section>

      <div className="mt-8">
        <SignOutButton className="btn-ghost w-full" />
      </div>
    </CustomerShell>
  );
}

function Field({
  label, value, badge, badgeClass,
}: { label: string; value: string; badge?: string; badgeClass?: string }) {
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-xs text-slate">{label}</p>
        <p className="text-sm text-ink">{value}</p>
      </div>
      {badge && <span className={badgeClass}>{badge}</span>}
    </div>
  );
}
