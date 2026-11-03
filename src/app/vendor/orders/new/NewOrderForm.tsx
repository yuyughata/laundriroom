"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { findCustomer, createVendorOrder, type FoundCustomer } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { money } from "@/lib/format";
import type { ServiceExtra } from "@/lib/database.types";

type State = { error?: string } | null;

function Choice<T extends string>({
  name, value, onChange, options,
}: { name: string; value: T; onChange: (v: T) => void; options: readonly (readonly [T, string, string])[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input type="hidden" name={name} value={value} />
      {options.map(([val, title, sub]) => (
        <button type="button" key={val} onClick={() => onChange(val)}
          className={`rounded-card border p-3 text-left ${value === val ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
          <p className="text-sm font-medium">{title}</p>
          <p className={`text-xs ${value === val ? "text-ivory/70" : "text-slate"}`}>{sub}</p>
        </button>
      ))}
    </div>
  );
}

export function NewOrderForm({
  vendorDelivery, extras, deliveryFee, branches, pricedByDistance,
}: {
  vendorDelivery: string; extras: ServiceExtra[]; deliveryFee: number;
  /** Branches this staff member can take orders for (one = no picker). */
  branches: { id: string; name: string }[];
  /** Delivery priced by Google Maps distance (shown on the next screen). */
  pricedByDistance: boolean;
}) {
  // Customer
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundCustomer[] | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [customer, setCustomer] = useState<FoundCustomer | null>(null);
  const [adding, setAdding] = useState(false);

  // Order
  const [entry, setEntry] = useState<"drop_off" | "pickup">("drop_off");
  const [ret, setRet] = useState<"collection" | "delivery">("collection");
  const [deliveredBy, setDeliveredBy] = useState<"own_rider" | "dispatch_partner">(
    vendorDelivery === "dispatch_partner" ? "dispatch_partner" : "own_rider");
  const [tier, setTier] = useState<"standard" | "premium">("standard");
  const [speed, setSpeed] = useState<"normal" | "express">("normal");
  const [pay, setPay] = useState<"on_delivery" | "online">("on_delivery");
  const [chosen, setChosen] = useState<string[]>([]);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");

  const [state, action] = useFormState<State, FormData>(createVendorOrder as (s: State, f: FormData) => Promise<State>, null);

  const search = () => startSearch(async () => {
    setSearchErr(null); setResults(null); setCustomer(null);
    const r = await findCustomer(query);
    if (r.error) setSearchErr(r.error);
    else {
      setResults(r.results ?? []);
      if (!r.results?.length) setAdding(true);
    }
  });

  const isEmail = query.includes("@");
  const hasCustomer = !!customer || adding;

  return (
    <form action={action} className="mt-6 grid gap-6 lg:grid-cols-2">
      {/* ── Customer ─────────────────────────────────────────────── */}
      <section className="card space-y-4 p-5 lg:col-span-2">
        <h2 className="font-display text-lg text-ink">Customer</h2>
        {customer ? (
          <div className="flex items-center justify-between rounded-card border border-ink/10 p-3">
            <div>
              <p className="font-medium text-ink">{customer.full_name || "Customer"}</p>
              <p className="text-xs text-slate">{[customer.phone, customer.email_hint].filter(Boolean).join(" · ")}</p>
            </div>
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { setCustomer(null); setResults(null); }}>
              Change
            </button>
            <input type="hidden" name="customer_id" value={customer.id} />
          </div>
        ) : adding ? (
          <div className="space-y-3">
            <p className="text-sm text-slate">
              {results?.length === 0 ? "No customer with that phone or email yet — add them:" : "Add a new customer:"}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="new_name">Full name</label>
                <input id="new_name" name="new_name" required className="field" />
              </div>
              <div>
                <label className="label" htmlFor="new_phone">Phone</label>
                <input id="new_phone" name="new_phone" required type="tel" className="field"
                  defaultValue={isEmail ? "" : query} placeholder="0803 123 4567" />
              </div>
              <div>
                <label className="label" htmlFor="new_email">Email (optional)</label>
                <input id="new_email" name="new_email" type="email" className="field" defaultValue={isEmail ? query : ""} />
              </div>
            </div>
            <p className="text-xs text-slate">
              With an email they&apos;ll get an invite to set a password and track their order. Without one, the
              account is created on their phone number.
            </p>
            <button type="button" className="text-xs text-slate underline" onClick={() => { setAdding(false); setResults(null); }}>
              Search instead
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="field" value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
                placeholder="Customer phone (0803…) or email" aria-label="Customer phone or email" />
              <button type="button" className="btn-primary px-4" disabled={searching} onClick={search}>
                {searching ? "Searching…" : "Find"}
              </button>
            </div>
            {searchErr && <p className="text-sm text-danger">{searchErr}</p>}
            {results && results.length > 0 && (
              <div className="space-y-2">
                {results.map((r) => (
                  <button type="button" key={r.id} onClick={() => setCustomer(r)}
                    className="card flex w-full items-center justify-between p-3 text-left hover:ring-2 hover:ring-ink">
                    <div>
                      <p className="font-medium text-ink">{r.full_name || "Customer"}</p>
                      <p className="text-xs text-slate">{[r.phone, r.email_hint].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="chip-ink">Use</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="text-xs text-slate underline" onClick={() => setAdding(true)}>
              New customer
            </button>
          </div>
        )}
      </section>

      {/* ── Order ────────────────────────────────────────────────── */}
      <section className={`card space-y-5 p-5 ${hasCustomer ? "" : "pointer-events-none opacity-50"}`}>
        {branches.length > 1 ? (
          <div>
            <label className="label" htmlFor="branch_id">Branch</label>
            <select id="branch_id" name="branch_id" className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        ) : branchId ? <input type="hidden" name="branch_id" value={branchId} /> : null}
        <div>
          <p className="label">Getting it in</p>
          <Choice name="entry_mode" value={entry} onChange={setEntry} options={[
            ["drop_off", "At the counter", "Customer drops off now"],
            ["pickup", "Pickup", "Collect from the customer"],
          ] as const} />
        </div>
        <div>
          <p className="label">Getting it back</p>
          <Choice name="return_mode" value={ret} onChange={setRet} options={[
            ["collection", "Customer collects", "From this laundry"],
            ["delivery", "Delivery", pricedByDistance ? "Fee by distance (Google Maps)"
              : deliveryFee ? `${money(deliveryFee)} delivery fee` : "Deliver to the customer"],
          ] as const} />
        </div>
        {ret === "delivery" && vendorDelivery === "both" && (
          <div>
            <p className="label">Delivered by</p>
            <Choice name="delivered_by" value={deliveredBy} onChange={setDeliveredBy} options={[
              ["own_rider", "Our rider", "Your own rider"],
              ["dispatch_partner", "Dispatch partner", "Third-party dispatch"],
            ] as const} />
          </div>
        )}
        {ret === "delivery" && vendorDelivery !== "both" && <input type="hidden" name="delivered_by" value={deliveredBy} />}
        {(entry === "pickup" || ret === "delivery") && (
          <div>
            <p className="label">Customer&apos;s address</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input name="address_line1" className="field sm:col-span-3" required placeholder="House number and street" aria-label="Street address" />
              <input name="address_area" className="field sm:col-span-2" placeholder="Area" aria-label="Area" />
              <input name="address_city" className="field" defaultValue="Lagos" aria-label="City" />
            </div>
            <p className="mt-1 text-xs text-slate">Saved to the customer&apos;s account{pricedByDistance ? " and used to price the delivery by distance" : ""}.</p>
          </div>
        )}
        <div>
          <p className="label">Payment</p>
          <Choice name="payment_timing" value={pay} onChange={setPay} options={[
            ["on_delivery", "Pay on delivery", "Customer pays in the app at handover"],
            ["online", "Pay online", "Customer pays in the app once priced"],
          ] as const} />
        </div>
      </section>

      <section className={`card space-y-5 p-5 ${hasCustomer ? "" : "pointer-events-none opacity-50"}`}>
        <div>
          <p className="label">Service</p>
          <Choice name="service_tier" value={tier} onChange={setTier} options={[
            ["standard", "Standard", "Everyday clean"],
            ["premium", "Premium", "High-end care, with extras"],
          ] as const} />
        </div>
        {tier === "premium" && (
          <div>
            <p className="label">Premium extras</p>
            {chosen.map((id) => <input key={id} type="hidden" name="extras" value={id} />)}
            <div className="space-y-2">
              {extras.map((e) => {
                const on = chosen.includes(e.id);
                return (
                  <button type="button" key={e.id}
                    onClick={() => setChosen((c) => (on ? c.filter((x) => x !== e.id) : [...c, e.id]))}
                    className={`card flex w-full items-center justify-between p-3 text-left ${on ? "ring-2 ring-champagne" : ""}`}>
                    <span className="text-sm text-ink">{e.name}</span>
                    <span className="text-sm text-ink">{money(e.price)} {on ? "✓" : "+"}</span>
                  </button>
                );
              })}
              {!extras.length && <p className="text-xs text-slate">No extras available yet.</p>}
            </div>
          </div>
        )}
        <div>
          <p className="label">Turnaround</p>
          <Choice name="turnaround" value={speed} onChange={setSpeed} options={[
            ["normal", "Normal", "Standard turnaround"],
            ["express", "Express", "Faster, priority handling"],
          ] as const} />
        </div>
        <div>
          <label className="label" htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" rows={2} className="field" placeholder="Stains, delicate items, address details…" />
        </div>
      </section>

      <div className="lg:col-span-2">
        {state?.error && <p className="mb-3 text-sm text-danger">{state.error}</p>}
        <SubmitButton className="btn-primary w-full sm:w-auto sm:px-8" disabled={!hasCustomer}>
          Create order &amp; check items in
        </SubmitButton>
        <p className="mt-2 text-xs text-slate">Items are priced as you check them in on the next screen.</p>
      </div>
    </form>
  );
}
