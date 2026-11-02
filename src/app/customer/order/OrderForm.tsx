"use client";

import { useState } from "react";
import { createOrder } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { money } from "@/lib/format";
import { Stars } from "@/components/ui/Stars";
import type { ServiceExtra } from "@/lib/database.types";

export type OrderVendor = {
  id: string; name: string; area: string | null; city: string | null;
  delivery: string; openNow: boolean; hours: string;
  rating: number; reviewCount: number;
};

export function OrderForm({
  vendors, deliveryFee, deliveryFeeLabel, extras,
}: {
  vendors: OrderVendor[]; deliveryFee: number; deliveryFeeLabel: string;
  extras: ServiceExtra[];
}) {
  const firstOpen = vendors.find((v) => v.openNow) ?? vendors[0];
  const [vendorId, setVendorId] = useState(firstOpen?.id ?? "");
  const [entry, setEntry] = useState<"pickup" | "drop_off">("drop_off");
  const [ret, setRet] = useState<"delivery" | "collection">("collection");
  const [tier, setTier] = useState<"standard" | "premium">("standard");
  const [speed, setSpeed] = useState<"normal" | "express">("normal");
  const [pay, setPay] = useState<"online" | "on_delivery">("online");
  const [chosenExtras, setChosenExtras] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const vendor = vendors.find((v) => v.id === vendorId);
  const canDispatch = vendor && (vendor.delivery === "both" || vendor.delivery === "dispatch_partner");

  const extrasTotal = tier === "premium"
    ? extras.filter((e) => chosenExtras.includes(e.id)).reduce((s, e) => s + Number(e.price), 0)
    : 0;
  const vendorOpen = vendor?.openNow ?? false;

  function toggleExtra(id: string) {
    setChosenExtras((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await createOrder(formData);
    if (res?.error) setError(res.error);
  }

  if (vendors.length === 0) {
    return <p className="mt-8 text-sm text-slate">No laundries are available in your area yet.</p>;
  }

  return (
    <form action={onSubmit} className="mt-6 space-y-6">
      <input type="hidden" name="vendor_id" value={vendorId} />
      {tier === "premium" && chosenExtras.map((id) => <input key={id} type="hidden" name="extras" value={id} />)}

      <section>
        <p className="label">Choose a laundry</p>
        <div className="space-y-2">
          {vendors.map((v) => (
            <button type="button" key={v.id} onClick={() => setVendorId(v.id)}
              className={`card flex w-full items-center justify-between p-4 text-left ${
                vendorId === v.id ? "ring-2 ring-ink" : ""} ${v.openNow ? "" : "opacity-70"}`}>
              <div>
                <p className="font-medium text-ink">{v.name}</p>
                <p className="text-xs text-slate">
                  {[v.area, v.city].filter(Boolean).join(", ")} · {v.hours}
                </p>
                <div className="mt-1">
                  {v.reviewCount > 0
                    ? <Stars value={v.rating} size={13} showValue count={v.reviewCount} />
                    : <span className="text-xs text-slate">No reviews yet</span>}
                </div>
              </div>
              <span className={v.openNow ? "chip-ok" : "chip-muted"}>{v.openNow ? "Open" : "Closed"}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Service tier */}
      <section>
        <p className="label">Service</p>
        <input type="hidden" name="service_tier" value={tier} />
        <div className="grid grid-cols-2 gap-2">
          {([
            ["standard", "Standard", "Everyday clean"],
            ["premium", "Premium", "High-end care, with extras"],
          ] as const).map(([val, title, sub]) => (
            <button type="button" key={val} onClick={() => setTier(val)}
              className={`rounded-card border p-3 text-left ${
                tier === val ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
              <p className="text-sm font-medium">{title}</p>
              <p className={`text-xs ${tier === val ? "text-ivory/70" : "text-slate"}`}>{sub}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Premium extras */}
      {tier === "premium" && (
        <section>
          <p className="label">Premium extras</p>
          {extras.length === 0 ? (
            <p className="text-xs text-slate">No extras available yet.</p>
          ) : (
            <div className="space-y-2">
              {extras.map((e) => {
                const on = chosenExtras.includes(e.id);
                return (
                  <button type="button" key={e.id} onClick={() => toggleExtra(e.id)}
                    className={`card flex w-full items-center justify-between p-3 text-left ${on ? "ring-2 ring-champagne" : ""}`}>
                    <div>
                      <p className="text-sm font-medium text-ink">{e.name}</p>
                      {e.description && <p className="text-xs text-slate">{e.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink">{money(e.price)}</span>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                        on ? "bg-champagne text-ink" : "bg-ink/10 text-slate"}`}>{on ? "✓" : "+"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Turnaround */}
      <section>
        <p className="label">Turnaround</p>
        <input type="hidden" name="turnaround" value={speed} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSpeed("normal")}
            className={`rounded-card border p-3 text-left ${speed === "normal" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
            <p className="text-sm font-medium">Normal</p>
            <p className={`text-xs ${speed === "normal" ? "text-ivory/70" : "text-slate"}`}>Standard delivery time</p>
          </button>
          <button type="button" onClick={() => setSpeed("express")}
            className={`rounded-card border p-3 text-left ${speed === "express" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
            <p className="text-sm font-medium">Express</p>
            <p className={`text-xs ${speed === "express" ? "text-ivory/70" : "text-slate"}`}>Faster, priority handling</p>
          </button>
        </div>
      </section>

      <Choice label="How does it get there?" name="entry_mode" value={entry}
        onChange={(v) => setEntry(v as typeof entry)}
        options={[["drop_off", "I'll drop off"], ["pickup", "Pick up from me"]]} />

      <Choice label="How does it come back?" name="return_mode" value={ret}
        onChange={(v) => setRet(v as typeof ret)}
        options={[["collection", "I'll collect"], ["delivery", "Deliver to me"]]} />

      {ret === "delivery" && (
        <Choice label="Delivered by" name="delivered_by" value="own_rider" onChange={() => {}}
          options={canDispatch
            ? [["own_rider", "Vendor rider"], ["dispatch_partner", "Dispatch partner"]]
            : [["own_rider", "Vendor rider"]]} />
      )}

      <Choice label="When would you like to pay?" name="payment_timing" value={pay}
        onChange={(v) => setPay(v as typeof pay)}
        options={[["online", "Pay online once priced"], ["on_delivery", "Pay on delivery"]]} />

      <div>
        <label className="label" htmlFor="notes">Notes for the laundry (optional)</label>
        <textarea id="notes" name="notes" rows={2} className="field" placeholder="Gate code, delicate items…" />
      </div>

      {/* Estimate so far */}
      <div className="card p-4">
        <p className="text-sm font-medium text-ink">Estimate</p>
        <div className="mt-2 space-y-1 text-sm">
          {ret === "delivery" && <Line label="Delivery" value={deliveryFeeLabel} />}
          {extrasTotal > 0 && <Line label="Premium extras" value={money(extrasTotal)} />}
        </div>
        <p className="mt-2 text-xs text-slate">
          Item prices are added when staff check in your laundry. You&apos;ll see the
          full total before you pay.
        </p>
      </div>

      {!vendorOpen && vendor && (
        <p className="text-sm text-warn">
          {vendor.name} is closed right now (hours {vendor.hours}). Choose an open
          laundry, or come back during opening hours to drop off or book a pickup.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <SubmitButton className="btn-accent w-full" disabled={!vendorOpen}>Place order</SubmitButton>
    </form>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

function Choice({
  label, name, value, onChange, options,
}: {
  label: string; name: string; value: string;
  onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <section>
      <p className="label">{label}</p>
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-2 gap-2">
        {options.map(([val, text]) => (
          <button type="button" key={val} onClick={() => onChange(val)}
            className={`rounded-card border px-4 py-3 text-sm ${
              value === val ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
            {text}
          </button>
        ))}
      </div>
    </section>
  );
}
