"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { signIn } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { safeNext } from "@/lib/nav";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNext(searchParams?.next);
  const carry = next ? `?next=${encodeURIComponent(next)}` : "";
  const [state, action] = useFormState(signIn, null as { error?: string } | null);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Welcome back</h1>
      <p className="mt-2 text-sm text-slate">Sign in to your laundriroom account.</p>

      <form action={action} className="mt-8 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="field" placeholder="you@example.com" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-xs text-slate underline">Forgot password?</Link>
          </div>
          <input id="password" name="password" type="password" required className="field" placeholder="••••••••" />
        </div>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton>Sign in</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-slate">
        New here?{" "}
        <Link href={`/signup${carry}`} className="font-medium text-ink underline">Create an account</Link>
      </p>
    </div>
  );
}
