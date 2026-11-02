"use client";

import { useState, useTransition } from "react";
import { setPlatformRates, setOtherCharges, setGlobalDeliveryFee } from "../actions";
import { money } from "@/lib/format";

/** Commission, express and premium — one set that applies to every vendor. */
export function PlatformRatesEditor({
  commissionPct, expressPct, premiumPct,
}: { commissionPct: number; expressPct: number; premiumPct: number }) {
  const [c, setC] = useState(String(commissionPct));
  const [ex, setEx] = useState(String(expressPct));
  const [pr, setPr] = useState(String(premiumPct));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const touch = (f: (v: string) => void) => (v: string) => { f(v); setSaved(false); };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Commission" unit="%" value={c} onChange={touch(setC)}
          suffix="Taken from the vendor's items + extras + delivery when the payout is made." />
        <Field label="Express markup" unit="%" value={ex} onChange={touch(setEx)}
          suffix="Added to express orders on the items + extras subtotal. Kept by the platform." />
        <Field label="Premium markup" unit="%" value={pr} onChange={touch(setPr)}
          suffix="Added to premium orders on the items + extras subtotal. Kept by the platform." />
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}
          onClick={() => start(async () => {
            setErr(null);
            const r = await setPlatformRates(Number(c) || 0, Number(ex) || 0, Number(pr) || 0);
            if (r?.error) setErr(r.error); else setSaved(true);
          })}>
          Save platform rates
        </button>
        {saved && <span className="text-sm text-teal">Saved — applies to every vendor.</span>}
      </div>
    </div>
  );
}

export function DeliveryFeeEditor({ current }: { current: number }) {
  const [amount, setAmount] = useState(String(current));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <label className="label">Delivery fee</label>
      <div className="flex items-center gap-2">
        <span className="text-lg text-slate">₦</span>
        <input className="field max-w-[140px]" inputMode="numeric" value={amount}
          onChange={(e) => { setAmount(e.target.value); setSaved(false); }} />
        <button className="btn-primary" disabled={pending}
          onClick={() => start(async () => { await setGlobalDeliveryFee(Number(amount) || 0); setSaved(true); })}>
          Save
        </button>
      </div>
      <p className="mt-1 text-xs text-slate">Flat fee for pickup and delivery orders. Paid to the vendor.</p>
      {saved && <p className="mt-1 text-xs text-teal">Saved · {money(Number(amount) || 0)}</p>}
    </div>
  );
}

export function OtherChargesEditor({ penaltyPct, referralReward }: { penaltyPct: number; referralReward: number }) {
  const [pe, setPe] = useState(String(penaltyPct));
  const [rr, setRr] = useState(String(referralReward));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Non-collection penalty" unit="%" value={pe} onChange={(v) => { setPe(v); setSaved(false); }}
          suffix="Of the delivery fee, charged each time a delivery is rescheduled because the customer wasn't available." />
        <Field label="Referral reward" unit="₦" value={rr} onChange={(v) => { setRr(v); setSaved(false); }}
          suffix="Credit issued to a customer when someone they referred completes a first order (0 = off)." />
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}
          onClick={() => start(async () => {
            setErr(null);
            const r = await setOtherCharges(Number(pe) || 0, Number(rr) || 0);
            if (r?.error) setErr(r.error); else setSaved(true);
          })}>
          Save charges
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
        {unit === "₦" && <span className="text-lg text-slate">₦</span>}
        <input className="field max-w-[120px]" inputMode="decimal" value={value}
          onChange={(e) => onChange(e.target.value)} />
        {unit === "%" && <span className="text-lg text-slate">%</span>}
      </div>
      <p className="mt-1 max-w-xs text-xs text-slate">{suffix}</p>
    </div>
  );
}
