"use client";

import { useState, useTransition } from "react";
import { setPlatformRates, setOtherCharges, setGlobalDeliveryFee, setPayoutDelay, setDeliveryPricing } from "../actions";
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
      <p className="mt-1 text-xs text-slate">Flat fee for delivery orders, and the fallback when distance pricing can&apos;t find a distance. Paid to the vendor.</p>
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

/** Payout timing: 0 hours (default) pays vendors the moment an order is completed and paid. */
export function PayoutDelayEditor({ hours }: { hours: number }) {
  const [h, setH] = useState(String(hours));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(h);

  return (
    <div>
      <label className="label">Hold payouts for</label>
      <div className="flex flex-wrap items-center gap-2">
        <input className="field max-w-[120px]" inputMode="numeric" value={h}
          onChange={(e) => { setH(e.target.value); setSaved(false); }} />
        <span className="text-sm text-slate">hours</span>
        <button className="btn-primary" disabled={pending}
          onClick={() => start(async () => {
            setErr(null);
            const r = await setPayoutDelay(Math.round(Number(h)));
            if (r?.error) setErr(r.error); else setSaved(true);
          })}>
          Save
        </button>
      </div>
      <p className="mt-1 max-w-md text-xs text-slate">
        {Number.isFinite(n) && n > 0
          ? `Vendors are paid ${n} hour${n === 1 ? "" : "s"} after an order is completed and paid. Set 0 to pay immediately.`
          : "0 = vendors are paid through Paystack immediately once an order is completed and paid (recommended). Add hours only if you want a window to catch disputes first."}
      </p>
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
      {saved && <p className="mt-1 text-xs text-teal">Saved.</p>}
    </div>
  );
}

/** Flat fee, or Google Maps distance pricing (base + per km, minimum fee). */
export function DeliveryPricingEditor({
  mode, perKm, base, min, flat, mapsReady,
}: { mode: "flat" | "distance"; perKm: number; base: number; min: number; flat: number; mapsReady: boolean }) {
  const [m, setM] = useState(mode);
  const [km, setKm] = useState(String(perKm));
  const [b, setB] = useState(String(base));
  const [mn, setMn] = useState(String(min));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fare = (d: number) => Math.ceil(Math.max(Number(mn) || 0, (Number(b) || 0) + (Number(km) || 0) * d) / 50) * 50;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {([
          ["flat", "Flat fee", `Every delivery costs ${money(flat)}.`],
          ["distance", "By distance (Google Maps)", "Like a ride-hailing fare: base + amount per km of driving distance."],
        ] as const).map(([val, title, sub]) => (
          <button type="button" key={val} onClick={() => { setM(val); setSaved(false); }}
            className={`rounded-card border p-3 text-left ${m === val ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
            <p className="text-sm font-medium">{title}</p>
            <p className={`text-xs ${m === val ? "text-ivory/70" : "text-slate"}`}>{sub}</p>
          </button>
        ))}
      </div>

      {m === "distance" && (
        <>
          {!mapsReady && (
            <p className="rounded-card bg-warn/10 px-3 py-2 text-xs text-warn">
              Google Maps isn&apos;t connected: add <span className="font-mono">GOOGLE_MAPS_API_KEY</span> to the app&apos;s
              environment (Geocoding + Distance Matrix APIs enabled). Until then every delivery uses the flat fee.
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Per kilometre" unit="₦" value={km} onChange={(v) => { setKm(v); setSaved(false); }}
              suffix="Charged for each km of driving distance from the branch to the customer." />
            <Field label="Base fare" unit="₦" value={b} onChange={(v) => { setB(v); setSaved(false); }}
              suffix="Added to every delivery (0 for none)." />
            <Field label="Minimum fee" unit="₦" value={mn} onChange={(v) => { setMn(v); setSaved(false); }}
              suffix="A delivery never costs less than this (0 for none)." />
          </div>
          <p className="text-xs text-slate">
            Examples: 2 km → {money(fare(2))} · 5 km → {money(fare(5))} · 10 km → {money(fare(10))} (rounded up to the nearest ₦50).
          </p>
        </>
      )}

      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}
          onClick={() => start(async () => {
            setErr(null);
            const r = await setDeliveryPricing({ mode: m, perKm: Number(km) || 0, base: Number(b) || 0, min: Number(mn) || 0 });
            if (r?.error) setErr(r.error); else setSaved(true);
          })}>
          Save delivery pricing
        </button>
        {saved && <span className="text-sm text-teal">Saved.</span>}
      </div>
    </div>
  );
}
