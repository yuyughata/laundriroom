import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { PasswordForm } from "../PasswordForm";

export const dynamic = "force-dynamic";

/** Landing page for the reset link: the link signs the user in, then they pick a new password. */
export default async function ResetPasswordPage() {
  const profile = await getProfile();

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Choose a new password</h1>
      {profile ? (
        <>
          <p className="mt-2 text-sm text-slate">For {profile.email}.</p>
          <PasswordForm mode="reset" />
        </>
      ) : (
        <div className="card mt-8 p-5">
          <p className="font-medium text-ink">This link has expired</p>
          <p className="mt-1 text-sm text-slate">Reset links work once and expire soon. Request a new one.</p>
          <Link href="/forgot-password" className="btn-primary mt-4 w-full">Send a new link</Link>
        </div>
      )}
    </div>
  );
}
