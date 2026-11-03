"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { signUp } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { safeNext } from "@/lib/nav";

export default function SignupPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNext(searchParams?.next);
  const carry = next ? `?next=${encodeURIComponent(next)}` : "";
  const [state, action] = useFormState(signUp, null as { error?: string } | null);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Create your account</h1>
      <p className="mt-2 text-sm text-slate">
        You can start ordering right away — we&apos;ll email a link to verify.
      </p>

      <form action={action} className="mt-8 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label className="label" htmlFor="full_name">Full name</label>
          <input id="full_name" name="full_name" required className="field" placeholder="Barry Okeke" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="field" placeholder="you@example.com" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" required className="field" placeholder="+234 ..." />
          <p className="mt-1 text-xs text-slate">Used for WhatsApp/SMS updates and by riders.</p>
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} className="field" placeholder="At least 8 characters" />
        </div>
        <div>
          <label className="label" htmlFor="ref">Referral code (optional)</label>
          <input id="ref" name="ref" className="field uppercase" placeholder="e.g. LRAB12CD" />
        </div>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton className="btn-accent w-full">Create account</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-slate">
        Already have an account?{" "}
        <Link href={`/login${carry}`} className="font-medium text-ink underline">Sign in</Link>
      </p>
    </div>
  );
}
