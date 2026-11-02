"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { requestPasswordReset } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

export default function ForgotPasswordPage() {
  const [state, action] = useFormState(requestPasswordReset, null as { error?: string; sent?: boolean } | null);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Forgot your password?</h1>
      <p className="mt-2 text-sm text-slate">Enter your email and we&apos;ll send you a link to choose a new one.</p>

      {state?.sent ? (
        <div className="card mt-8 p-5">
          <p className="font-medium text-ink">Check your email</p>
          <p className="mt-1 text-sm text-slate">
            If there&apos;s an account for that address, a reset link is on its way. It works once and expires soon.
          </p>
        </div>
      ) : (
        <form action={action} className="mt-8 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="field" placeholder="you@example.com" />
          </div>
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <SubmitButton>Send reset link</SubmitButton>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate">
        Remembered it? <Link href="/login" className="font-medium text-ink underline">Sign in</Link>
      </p>
    </div>
  );
}
