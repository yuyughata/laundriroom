"use client";

import { useState, useTransition } from "react";
import { setFeesCharges } from "../actions";

export function FeesEditor({
  expressPct, premiumPct, penaltyPct, referralReward,
}: { expressPct: number; premiumPct: number; penaltyPct: number; referralReward: number }) {
  const [ex, setEx] = useState(String(expressPct));
  const [pr, setPr] = useState(String(premiumPct));
  const [pe, setPe] = useState(String(penaltyPct));
  const [rr, setRr] = useState(String(referralReward));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Field label="Express markup" unit="%" suffix="of the item + extras subtotal, added to the customer's total and kept by the platform"
        value={ex} onChange={(v) => { setEx(v); setSaved(false); }} />
      <Field label="Premium markup" unit="%" suffix="added on premium orders, kept by the platform"
        value={pr} onChange={(v) => { setPr(v); setSaved(false); }} />
      <Field label="Non-collection penalty" unit="%" suffix="of the delivery fee, charged each time a delivery is rescheduled because the customer wasn't available"
        value={pe} onChange={(v) => { setPe(v); setSaved(false); }} />
      <Field label="Referral reward" unit="₦" suffix="fixed credit issued to a customer when someone they referred completes a first order (0 = off)"
        value={rr} onChange={(v) => { setRr(v); setSaved(false); }} />

      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}
          onClick={() => start(async () => {
            setErr(null);
            const r = await setFeesCharges(Number(ex) || 0, Number(pr) || 0, Number(pe) || 0, Number(rr) || 0);
            if (r?.error) setErr(r.error); else setSaved(true);
          })}>
          Save fees & charges
        </button>
        {saved && <span className="text-sm text-teal">Saved.</span>}
      </div>
    </div>
  );
}

function Field({
  label, suffix, unit, value, onChange,
}: { label: string; suffix: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input className="field max-w-[120px]" inputMode="decimal" value={value}
          onChange={(e) => onChange(e.target.value)} />
        <span className="text-lg text-slate">{unit}</span>
      </div>
      <p className="mt-1 max-w-xl text-xs text-slate">{suffix}</p>
    </div>
  );
}
