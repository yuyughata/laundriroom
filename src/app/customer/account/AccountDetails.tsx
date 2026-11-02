"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { updateMyProfile } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

type State = { error?: string; ok?: boolean; message?: string } | null;

export function AccountDetails({
  fullName, email, phone, verified,
}: { fullName: string; email: string; phone: string; verified: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useFormState<State, FormData>(
    async (prev, fd) => {
      const r = (await updateMyProfile(prev, fd)) as State;
      if (r?.ok) setEditing(false);
      return r;
    }, null);

  if (!editing) {
    return (
      <>
        <section className="card mt-6 divide-y divide-ink/5">
          <Row label="Name" value={fullName || "—"} />
          <Row label="Email" value={email || "—"} badge={verified ? "Verified" : "Unverified"}
            badgeClass={verified ? "chip-ok" : "chip-warn"} />
          <Row label="Phone" value={phone || "—"} />
        </section>
        {state?.message && <p className="mt-3 text-sm text-teal">{state.message}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={() => setEditing(true)}>Edit details</button>
          <a className="btn-ghost" href="/account/password">Change password</a>
        </div>
      </>
    );
  }

  return (
    <form action={action} className="card mt-6 space-y-4 p-4">
      <div>
        <label className="label" htmlFor="full_name">Name</label>
        <input id="full_name" name="full_name" required defaultValue={fullName} className="field" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required defaultValue={email} className="field" autoComplete="email" />
        <p className="mt-1 text-xs text-slate">Changing it? We&apos;ll email a link to confirm the new address.</p>
      </div>
      <div>
        <label className="label" htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="tel" required defaultValue={phone} className="field" autoComplete="tel" />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}

function Row({ label, value, badge, badgeClass }: { label: string; value: string; badge?: string; badgeClass?: string }) {
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
