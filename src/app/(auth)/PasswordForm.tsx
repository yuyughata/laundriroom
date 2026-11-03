"use client";

import { useFormState } from "react-dom";
import { setNewPassword, changePassword } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PasswordInput } from "@/components/ui/PasswordInput";

type State = { error?: string; ok?: boolean } | null;

/** New-password form. `mode="change"` also asks for the current password. */
export function PasswordForm({ mode }: { mode: "reset" | "change" }) {
  const [state, action] = useFormState<State, FormData>(
    (mode === "change" ? changePassword : setNewPassword) as (s: State, f: FormData) => Promise<State>, null);

  if (state?.ok) {
    return (
      <div className="card mt-8 p-5">
        <p className="font-medium text-ink">Password updated</p>
        <p className="mt-1 text-sm text-slate">We&apos;ve emailed you a confirmation. Use your new password next time you sign in.</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-4">
      {mode === "change" && (
        <div>
          <label className="label" htmlFor="current">Current password</label>
          <PasswordInput id="current" name="current" required autoComplete="current-password" className="field" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="password">New password</label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password"
          className="field" placeholder="At least 8 characters" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" className="field" />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton>{mode === "change" ? "Change password" : "Save new password"}</SubmitButton>
    </form>
  );
}
