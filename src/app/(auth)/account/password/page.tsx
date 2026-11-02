import Link from "next/link";
import { requireProfile, homeFor } from "@/lib/auth";
import { PasswordForm } from "../../PasswordForm";

export const dynamic = "force-dynamic";

/** Change password — any signed-in role. */
export default async function ChangePasswordPage() {
  const profile = await requireProfile();
  const back = profile.role === "customer" ? "/customer/account" : homeFor(profile.role);

  return (
    <div>
      <Link href={back} className="text-sm text-slate">← Back</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Change password</h1>
      <p className="mt-2 text-sm text-slate">
        For {profile.email}. Forgot your current one?{" "}
        <Link href="/forgot-password" className="font-medium text-ink underline">Reset it by email</Link>.
      </p>
      <PasswordForm mode="change" />
    </div>
  );
}
