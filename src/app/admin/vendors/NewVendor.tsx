"use client";

import { useState, useTransition } from "react";
import { createVendor } from "../actions";

export function NewVendor() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) return <button className="btn-primary text-sm" onClick={() => setOpen(true)}>Add vendor</button>;

  return (
    <form className="card absolute right-6 z-10 mt-2 w-80 space-y-3 p-5 shadow-lift"
      action={(fd) => start(async () => {
        setErr(null);
        const r = await createVendor(fd);
        if (r?.error) setErr(r.error); else setOpen(false);
      })}>
      <p className="font-medium text-ink">Onboard a vendor</p>
      <input name="name" className="field" placeholder="Vendor name" />
      <div className="grid grid-cols-2 gap-2">
        <input name="area" className="field" placeholder="Area" />
        <input name="city" className="field" placeholder="City" />
      </div>
      <select name="delivery" className="field">
        <option value="own_riders">Own riders</option>
        <option value="dispatch_partner">Dispatch partner</option>
        <option value="both">Both</option>
      </select>
      <p className="text-xs text-slate">Starts as pending — verify it, then attach a manager under Users.</p>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={pending}>Create</button>
        <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
