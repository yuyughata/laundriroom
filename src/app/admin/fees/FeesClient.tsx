"use client";

import { useState, useTransition } from "react";
import { setPlatformRates, setOtherCharges, setVendorRates, setGlobalDeliveryFee } from "../actions";
import { money } from "@/lib/format";

/** Commission, express and premium — the one set every vendor uses by default. */
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
        {saved && <span className="text-sm text-teal">Saved — applies to every vendor without an override.</span>}
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

/** One vendor's rates. Blank = platform rate (shown as the placeholder). */
export function VendorRatesRow({
  vendorId, name, status, commission, express, premium, defaults,
}: {
  vendorId: string; name: string; status: string;
  commission: number | null; express: number | null; premium: number | null;
  defaults: { commission: number; express: number; premium: number };
}) {
  const show = (v: number | null) => (v === null ? "" : String(v));
  const [c, setC] = useState(show(commission));
  const [ex, setEx] = useState(show(express));
  const [pr, setPr] = useState(show(premium));
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const parse = (v: string) => (v.trim() === "" ? null : Number(v));
  const custom = [c, ex, pr].some((v) => v.trim() !== "");

  const input = (v: string, set: (s: string) => void, def: number, label: string) => (
    <td className="px-3 py-2">
      <div className="flex items-center gap-1">
        <input aria-label={`${name} ${label}`} className="field w-20 py-1.5 text-sm" inputMode="decimal"
          placeholder={String(def)} value={v} onChange={(e) => { set(e.target.value); setState("idle"); }} />
        <span className="text-xs text-slate">%</span>
      </div>
    </td>
  );

  return (
    <tr className="border-t border-ink/5">
      <td className="px-3 py-2">
        <p className="font-medium text-ink">{name}</p>
        <p className="text-xs text-slate">{status}</p>
      </td>
      {input(c, setC, defaults.commission, "commission")}
      {input(ex, setEx, defaults.express, "express")}
      {input(pr, setPr, defaults.premium, "premium")}
      <td className="px-3 py-2">
        {custom ? <span className="chip-ink">Custom</span> : <span className="chip-muted">Platform</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={pending}
            onClick={() => start(async () => {
              const r = await setVendorRates(vendorId, parse(c), parse(ex), parse(pr));
              setState(r?.error ?? "saved");
            })}>
            Save
          </button>
          {custom && (
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={pending}
              onClick={() => start(async () => {
                const r = await setVendorRates(vendorId, null, null, null);
                if (!r?.error) { setC(""); setEx(""); setPr(""); }
                setState(r?.error ?? "saved");
              })}>
              Use platform
            </button>
          )}
          {state === "saved" && <span className="text-xs text-teal">Saved</span>}
          {state !== "idle" && state !== "saved" && <span className="text-xs text-danger">{state}</span>}
        </div>
      </td>
    </tr>
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
