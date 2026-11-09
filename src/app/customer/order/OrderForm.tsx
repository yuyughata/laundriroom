"use client";

import { useEffect, useState } from "react";
import { createOrder, quoteDeliveryFee, nearestBranches } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { money } from "@/lib/format";
import { Stars } from "@/components/ui/Stars";
import type { ServiceExtra } from "@/lib/database.types";

export type OrderBranch = {
  /** "" on a database without branches yet (the vendor's own location). */
  id: string; name: string; area: string | null; city: string | null; address_line: string | null;
  openNow: boolean; hours: string;
};

export type OrderVendor = {
  id: string; slug: string; name: string; area: string | null; city: string | null;
  delivery: string; openNow: boolean; hours: string;
  offersWashDry: boolean;
  rating: number; reviewCount: number;
  branches: OrderBranch[];
};

export type SavedAddress = { id: string; label: string; text: string };

export function OrderForm({
  vendors, deliveryFee, deliveryFeeLabel, pricedByDistance, nearestEnabled = false, washDry = null, extras, linkedVendorId, linkedBranchId, addresses, promoCode,
}: {
  vendors: OrderVendor[]; deliveryFee: number; deliveryFeeLabel: string;
  /** Admin turned on Google Maps distance pricing for deliveries. */
  pricedByDistance: boolean;
  /** Google Maps is connected and distance pricing is on → show "find the nearest laundry". */
  nearestEnabled?: boolean;
  /** Platform wash & dry only (bulk) pricing, or null when the offering is off. */
  washDry?: { price: number; minItems: number; customerPrice: number } | null;
  extras: ServiceExtra[];
  /** Opened from this vendor's profile link: order from them, list collapsed. */
  linkedVendorId?: string;
  /** …and a particular branch of theirs. */
  linkedBranchId?: string;
  addresses: SavedAddress[];
  /** From a promo QR / link: applied when the order is placed. */
  promoCode?: string;
}) {
  const firstOpen = vendors.find((v) => v.openNow) ?? vendors[0];
  const [vendorId, setVendorId] = useState(linkedVendorId ?? firstOpen?.id ?? "");
  const pickBranch = (v?: OrderVendor) => (v?.branches.find((b) => b.openNow) ?? v?.branches[0])?.id ?? "";
  const [branchId, setBranchId] = useState(linkedBranchId ?? pickBranch(vendors.find((v) => v.id === (linkedVendorId ?? firstOpen?.id))));
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "new");
  const [addr, setAddr] = useState({ line1: "", area: "", city: "Jos" });
  const [quote, setQuote] = useState<{ fee: number; km: number | null; note?: string } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [showAll, setShowAll] = useState(!linkedVendorId);
  const viaLink = !!linkedVendorId && vendorId === linkedVendorId;
  const shown = showAll ? vendors : vendors.filter((v) => v.id === linkedVendorId);
  const [entry, setEntry] = useState<"pickup" | "drop_off">("drop_off");
  const [ret, setRet] = useState<"delivery" | "collection">("collection");
  const [tier, setTier] = useState<"standard" | "premium">("standard");
  const [speed, setSpeed] = useState<"normal" | "express">("normal");
  const [pay, setPay] = useState<"online" | "on_delivery">("online");
  const [chosenExtras, setChosenExtras] = useState<string[]>([]);
  // Wash & dry only (bulk): a flat-rate alternative to the full service, when
  // the platform offers it and this laundry opted in.
  const [washDryMode, setWashDryMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nearest laundries (branch id → km), from a saved address or the phone's location.
  const [near, setNear] = useState<{ km: Record<string, number>; by: "road" | "straight"; from: string } | null>(null);
  const [nearBusy, setNearBusy] = useState(false);
  const [nearErr, setNearErr] = useState<string | null>(null);

  const vendor = vendors.find((v) => v.id === vendorId);
  const branch = vendor?.branches.find((b) => b.id === branchId) ?? vendor?.branches[0];
  const canDispatch = vendor && (vendor.delivery === "both" || vendor.delivery === "dispatch_partner");
  const needsAddress = entry === "pickup" || ret === "delivery";

  const branchKm = (b: OrderBranch) => (near && b.id && near.km[b.id] != null ? near.km[b.id] : null);
  const vendorKm = (v: OrderVendor) => {
    const ks = v.branches.map(branchKm).filter((k): k is number => k != null);
    return ks.length ? Math.min(...ks) : null;
  };
  /** With distances known, the nearest open branch (else the nearest). */
  const nearestBranch = (v: OrderVendor) => {
    const ranked = [...v.branches].filter((b) => branchKm(b) != null).sort((a, b) => branchKm(a)! - branchKm(b)!);
    return (ranked.find((b) => b.openNow) ?? ranked[0])?.id ?? pickBranch(v);
  };

  const canWashDry = !!washDry && !!vendor?.offersWashDry;

  function chooseVendor(v: OrderVendor) {
    setVendorId(v.id);
    setBranchId(near ? nearestBranch(v) : pickBranch(v));
    if (!(washDry && v.offersWashDry)) setWashDryMode(false); // new laundry may not offer it
  }

  async function findNear(input: { addressId?: string; lat?: number; lng?: number }, from: string) {
    setNearErr(null); setNearBusy(true);
    const r = await nearestBranches(input);
    setNearBusy(false);
    if ("error" in r) { setNearErr(r.error); return; }
    if (Object.keys(r.km).length === 0) { setNearErr("None of the laundries have a map location yet."); return; }
    setNear({ ...r, from });
  }
  function useMyLocation() {
    setNearErr(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) { setNearErr("This browser can't share your location. Choose a saved address instead."); return; }
    setNearBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => findNear({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "your location"),
      (e) => {
        setNearBusy(false);
        setNearErr(e.code === e.PERMISSION_DENIED
          ? "Location is blocked for this site. Allow it in your browser settings, or choose a saved address."
          : "Couldn't get your location. Try again, or choose a saved address.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  // When distances arrive, select the nearest open laundry (unless the order came from a laundry's link).
  useEffect(() => {
    if (!near || linkedVendorId) return;
    const ranked = [...vendors].filter((v) => vendorKm(v) != null).sort((a, b) => vendorKm(a)! - vendorKm(b)!);
    const best = ranked.find((v) => v.openNow) ?? ranked[0];
    if (best) { setVendorId(best.id); setBranchId(nearestBranch(best)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near]);
  const ordered = near
    ? [...shown].sort((a, b) => (vendorKm(a) ?? Infinity) - (vendorKm(b) ?? Infinity))
    : shown;

  // Distance pricing: re-quote when the branch or the address changes. A pickup
  // and a delivery to the same address cost the same trip, so one quote serves
  // both legs.
  const addrKey = addressId === "new" ? `${addr.line1}|${addr.area}|${addr.city}` : addressId;
  useEffect(() => {
    if (!pricedByDistance || !needsAddress || !vendor) { setQuote(null); return; }
    if (addressId === "new" && addr.line1.trim().length < 4) { setQuote(null); return; }
    let live = true;
    setQuoting(true);
    const t = setTimeout(async () => {
      const r = await quoteDeliveryFee({
        vendorId: vendor.id, branchId: branch?.id || undefined,
        ...(addressId === "new" ? { line1: addr.line1, area: addr.area, city: addr.city } : { addressId }),
      });
      if (!live) return;
      setQuoting(false);
      setQuote("error" in r ? null : { fee: r.fee, km: r.km, note: r.note });
    }, 600);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricedByDistance, needsAddress, vendor?.id, branch?.id, addrKey]);

  const extrasTotal = tier === "premium"
    ? extras.filter((e) => chosenExtras.includes(e.id)).reduce((s, e) => s + Number(e.price), 0)
    : 0;
  const vendorOpen = branch?.openNow ?? false;

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
      {promoCode && (
        <div className="rounded-card border border-champagne/50 bg-champagne/10 px-4 py-3 text-sm text-ink">
          Promo code <span className="font-mono font-semibold tracking-wider">{promoCode}</span> will be applied when you place this order.
          <input type="hidden" name="promo" value={promoCode} />
        </div>
      )}
      <input type="hidden" name="vendor_id" value={vendorId} />
      {branch?.id && <input type="hidden" name="branch_id" value={branch.id} />}
      {viaLink && <input type="hidden" name="via_vendor_link" value="1" />}
      {tier === "premium" && chosenExtras.map((id) => <input key={id} type="hidden" name="extras" value={id} />)}

      <section>
        <p className="label">{showAll ? "Choose a laundry" : "Your laundry"}</p>
        {showAll && vendors.length > 1 && nearestEnabled && (
          <div className="mb-3 rounded-card border border-ink/10 bg-white p-3">
            <p className="text-xs font-medium text-ink">Find the nearest laundry</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={nearBusy} onClick={useMyLocation}>
                {nearBusy ? "Finding…" : "Use my location"}
              </button>
              {addresses.length > 0 && (
                <select className="field max-w-[260px] py-1.5 text-xs" value="" disabled={nearBusy} aria-label="Nearest to a saved address"
                  onChange={(e) => {
                    const a = addresses.find((x) => x.id === e.target.value);
                    if (a) findNear({ addressId: a.id }, a.label || a.text);
                  }}>
                  <option value="">Nearest to a saved address…</option>
                  {addresses.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.text}</option>)}
                </select>
              )}
            </div>
            {near && (
              <p className="mt-2 text-xs text-slate">
                Nearest first from {near.from} · {near.by === "road" ? "distance by road" : "straight-line distance"}
              </p>
            )}
            {nearErr && <p className="mt-2 text-xs text-danger">{nearErr}</p>}
          </div>
        )}
        <div className="space-y-2">
          {ordered.map((v) => (
            <button type="button" key={v.id} onClick={() => chooseVendor(v)}
              className={`card flex w-full items-center justify-between p-4 text-left ${
                vendorId === v.id ? "ring-2 ring-ink" : ""} ${v.openNow ? "" : "opacity-70"}`}>
              <div>
                <p className="font-medium text-ink">{v.name}</p>
                <p className="text-xs text-slate">
                  {v.branches.length > 1
                    ? `${v.branches.length} branches · ${[...new Set(v.branches.map((b) => b.area).filter(Boolean))].slice(0, 3).join(", ")}`
                    : `${[v.area, v.city].filter(Boolean).join(", ")} · ${v.hours}`}
                </p>
                <div className="mt-1">
                  {v.reviewCount > 0
                    ? <Stars value={v.rating} size={13} showValue count={v.reviewCount} />
                    : <span className="text-xs text-slate">No reviews yet</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={v.openNow ? "chip-ok" : "chip-muted"}>{v.openNow ? "Open" : "Closed"}</span>
                {vendorKm(v) != null && <span className="text-xs font-medium text-ink">{fmtKm(vendorKm(v)!)}</span>}
              </div>
            </button>
          ))}
        </div>
        {!showAll && vendors.length > 1 && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-xs text-slate underline">
            Choose a different laundry
          </button>
        )}
      </section>

      {/* Branch, when the laundry has more than one */}
      {vendor && vendor.branches.length > 1 && (
        <section>
          <p className="label">Which branch?</p>
          <div className="space-y-2">
            {vendor.branches.map((b) => (
              <button type="button" key={b.id} onClick={() => setBranchId(b.id)}
                className={`card flex w-full items-center justify-between gap-3 p-3 text-left ${
                  branch?.id === b.id ? "ring-2 ring-ink" : ""} ${b.openNow ? "" : "opacity-70"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{b.name}</p>
                  <p className="truncate text-xs text-slate">
                    {[b.address_line, b.area].filter(Boolean).join(", ") || b.city} · {b.hours}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={b.openNow ? "chip-ok" : "chip-muted"}>{b.openNow ? "Open" : "Closed"}</span>
                  {branchKm(b) != null && <span className="text-xs font-medium text-ink">{fmtKm(branchKm(b)!)}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Service type: full service vs wash & dry only (when this laundry offers it) */}
      <input type="hidden" name="wash_dry" value={washDryMode ? "1" : "0"} />
      {canWashDry && washDry && (
        <section>
          <p className="label">Service type</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setWashDryMode(false)}
              className={`rounded-card border p-3 text-left ${!washDryMode ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
              <p className="text-sm font-medium">Full service</p>
              <p className={`text-xs ${!washDryMode ? "text-ivory/70" : "text-slate"}`}>Wash, dry, press &amp; fold · priced per item</p>
            </button>
            <button type="button" onClick={() => setWashDryMode(true)}
              className={`rounded-card border p-3 text-left ${washDryMode ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
              <p className="text-sm font-medium">Wash &amp; dry only · {money(washDry.customerPrice)}</p>
              <p className={`text-xs ${washDryMode ? "text-ivory/70" : "text-slate"}`}>
                Bulk flat rate{washDry.minItems > 0 ? ` for ${washDry.minItems}+ clothes` : ""} · no pressing or folding
              </p>
            </button>
          </div>
        </section>
      )}

      {/* Service tier (full service only) */}
      {!washDryMode && (
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
      )}

      {/* Premium extras */}
      {!washDryMode && tier === "premium" && (
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

      {needsAddress && (
        <section>
          <p className="label">{entry === "pickup" && ret === "delivery" ? "Pickup & delivery address"
            : entry === "pickup" ? "Pickup address" : "Delivery address"}</p>
          <input type="hidden" name="address_id" value={addressId} />
          {addresses.length > 0 && (
            <div className="mb-2 space-y-2">
              {addresses.map((a) => (
                <button type="button" key={a.id} onClick={() => setAddressId(a.id)}
                  className={`card w-full p-3 text-left ${addressId === a.id ? "ring-2 ring-ink" : ""}`}>
                  <p className="text-sm font-medium text-ink">{a.label}</p>
                  <p className="text-xs text-slate">{a.text}</p>
                </button>
              ))}
              <button type="button" onClick={() => setAddressId("new")}
                className={`card w-full p-3 text-left text-sm ${addressId === "new" ? "ring-2 ring-ink" : "text-slate"}`}>
                + A different address
              </button>
            </div>
          )}
          {addressId === "new" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <input name="address_line1" className="field sm:col-span-3" required placeholder="House number and street"
                value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} aria-label="Street address" />
              <input name="address_area" className="field sm:col-span-2" placeholder="Area (e.g. Rayfield)"
                value={addr.area} onChange={(e) => setAddr({ ...addr, area: e.target.value })} aria-label="Area" />
              <input name="address_city" className="field" placeholder="City"
                value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} aria-label="City" />
            </div>
          )}
          {addressId === "new" && <p className="mt-1 text-xs text-slate">We&apos;ll save it for next time.</p>}
        </section>
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
          {washDryMode && washDry && (
            <Line label="Wash & dry only (bulk)" value={money(washDry.customerPrice)} />
          )}
          {entry === "pickup" && (
            <Line label={quote?.km != null ? `Pickup · ${quote.km} km` : "Pickup"}
              value={!pricedByDistance ? deliveryFeeLabel
                : quoting ? "Working it out…"
                : quote ? money(quote.fee)
                : "Priced by distance"} />
          )}
          {ret === "delivery" && (
            <Line label={quote?.km != null ? `Delivery · ${quote.km} km` : "Delivery"}
              value={!pricedByDistance ? deliveryFeeLabel
                : quoting ? "Working it out…"
                : quote ? money(quote.fee)
                : "Priced by distance"} />
          )}
          {needsAddress && pricedByDistance && quote?.note && <p className="text-xs text-slate">{quote.note}</p>}
          {!washDryMode && extrasTotal > 0 && <Line label="Premium extras" value={money(extrasTotal)} />}
        </div>
        <p className="mt-2 text-xs text-slate">
          {washDryMode
            ? "A flat rate for washing and drying only — no pressing or folding. Delivery or pickup, if chosen, is added."
            : "Item prices are added when staff check in your laundry. You'll see the full total before you pay."}
        </p>
      </div>

      {!vendorOpen && vendor && (
        <p className="text-sm text-warn">
          {vendor.name}{vendor.branches.length > 1 && branch ? ` (${branch.name})` : ""} is closed right now
          (hours {branch?.hours ?? vendor.hours}). Choose an open {vendor.branches.length > 1 ? "branch or " : ""}laundry,
          or come back during opening hours to drop off or book a pickup.
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

/** 0.4 → "400 m", 3.25 → "3.3 km". */
function fmtKm(km: number) {
  return km < 1 ? `${Math.max(50, Math.round(km * 20) * 50)} m away` : `${km.toFixed(1)} km away`;
}
