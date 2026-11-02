"use client";

import { useState, useTransition } from "react";
import { savePlan, setGlobalDeliveryFee } from "../actions";
import { money } from "@/lib/format";
import type { VendorPlan } from "@/lib/database.types";

export function DeliveryFeeEditor({ current }: { current: number }) {
  const [amount, setAmount] = useState(String(current));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="card p-5">
      <p className="label">Global delivery fee</p>
      <p className="mb-3 text-xs text-slate">
        Default flat fee for delivery orders. You can add zone or vendor overrides later.
      </p>
      <div className="flex gap-2">
        <input className="field" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); setSaved(false); }} />
        <button className="btn-primary" disabled={pending}
          onClick={() => start(async () => { await setGlobalDeliveryFee(Number(amount)); setSaved(true); })}>
          Save
        </button>
      </div>
      {saved && <p className="mt-2 text-xs text-teal">Saved · {money(Number(amount))}</p>}
    </div>
  );
}

export function PlanCard({ plan }: { plan: VendorPlan }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="card p-5">
      {!edit ? (
        <>
          <div className="flex items-center justify-between">
            <p className="font-display text-lg text-ink">{plan.name}</p>
            {plan.is_default && <span className="chip-ink">Default</span>}
          </div>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate">Commission</p>
          <div className="mt-4 space-y-1 text-sm">
            <p className="text-ink">{(plan.commission_rate * 100).toFixed(1)}% commission
              <span className="text-slate"> · of the whole order total</span></p>
          </div>
          <button className="btn-ghost mt-4 text-xs" onClick={() => setEdit(true)}>Edit</button>
        </>
      ) : (
        <form action={(fd) => start(async () => {
          setErr(null);
          const r = await savePlan(fd);
          if (r?.error) setErr(r.error); else setEdit(false);
        })} className="space-y-3">
          <input type="hidden" name="id" value={plan.id} />
          <input className="field" name="name" defaultValue={plan.name} />
          <label className="label">Commission % (of whole order total)</label>
          <input className="field" name="commission_rate" defaultValue={(plan.commission_rate * 100).toString()} />
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-xs" disabled={pending}>Save</button>
            <button type="button" className="btn-ghost text-xs" onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
