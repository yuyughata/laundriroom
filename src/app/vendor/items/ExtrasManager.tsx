"use client";

import { useState, useTransition } from "react";
import { money } from "@/lib/format";
import type { ServiceExtra } from "@/lib/database.types";
import { saveVendorExtra, toggleVendorExtra, deleteVendorExtra } from "@/lib/vendorExtrasActions";

/** "10% of items" or a fixed ₦ amount. */
function priceLabel(e: Pick<ServiceExtra, "price" | "price_type" | "percent">) {
  return e.price_type === "percent" ? `${Number(e.percent ?? 0)}% of items` : money(e.price);
}

/** Shared Fixed-₦ / Percentage control for the new + edit forms. */
function PriceFields({ extra }: { extra?: ServiceExtra }) {
  const [type, setType] = useState<"fixed" | "percent">(extra?.price_type === "percent" ? "percent" : "fixed");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setType("fixed")}
          className={`rounded-card border p-2 text-xs ${type === "fixed" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
          Fixed ₦ price
        </button>
        <button type="button" onClick={() => setType("percent")}
          className={`rounded-card border p-2 text-xs ${type === "percent" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>
          Percentage of order
        </button>
      </div>
      <input type="hidden" name="price_type" value={type} />
      {type === "fixed" ? (
        <input className="field" name="price" inputMode="numeric" placeholder="Price (₦)"
          defaultValue={extra && extra.price_type !== "percent" ? String(extra.price) : ""} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input className="field" name="percent" inputMode="decimal" placeholder="e.g. 10"
              defaultValue={extra?.price_type === "percent" ? String(extra.percent ?? "") : ""} />
            <span className="text-sm text-slate">%</span>
          </div>
          <p className="text-xs text-slate">Charged as this % of the order&apos;s items total, worked out after check-in.</p>
        </>
      )}
    </div>
  );
}

export function ExtrasManager({ extras }: { extras: ServiceExtra[] }) {
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">Premium extras</h2>
          <p className="mt-1 max-w-xl text-sm text-slate">High-end add-ons customers can choose on a premium order. Each is a flat price or a percentage of their items total.</p>
        </div>
        {!adding && <button className="btn-primary text-sm" onClick={() => setAdding(true)}>Add extra</button>}
      </div>

      {adding && (
        <form className="card mt-4 max-w-md space-y-3 p-5" action={(fd) => start(async () => {
          setErr(null);
          const r = await saveVendorExtra(fd);
          if ("error" in r) setErr(r.error); else setAdding(false);
        })}>
          <p className="font-medium text-ink">New premium extra</p>
          <input className="field" name="name" placeholder="Name (e.g. Premium detergent)" />
          <input className="field" name="description" placeholder="Short description (optional)" />
          <PriceFields />
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-sm" disabled={pending}>Save</button>
            <button type="button" className="btn-ghost text-sm" onClick={() => { setAdding(false); setErr(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {extras.length === 0 ? (
        <p className="mt-4 rounded-card border border-ink/10 bg-white p-5 text-sm text-slate">
          No premium extras yet. Add one so customers can pick it on a premium order.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {extras.map((e) => <ExtraCard key={e.id} extra={e} />)}
        </div>
      )}
    </div>
  );
}

function ExtraCard({ extra }: { extra: ServiceExtra }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className={`card p-4 ${!extra.active ? "opacity-60" : ""}`}>
      {!edit ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-ink">{extra.name}</p>
              {extra.description && <p className="text-xs text-slate">{extra.description}</p>}
            </div>
            <p className="font-display text-lg text-ink">{priceLabel(extra)}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEdit(true)}>Edit</button>
            <button className={extra.active ? "chip-ok" : "chip-muted"} disabled={pending}
              onClick={() => start(async () => { await toggleVendorExtra(extra.id, !extra.active); })}>
              {extra.active ? "Active" : "Hidden"}
            </button>
            <button className="btn-ghost border-danger/30 px-3 py-1.5 text-xs text-danger" disabled={pending}
              onClick={() => { if (confirm(`Delete "${extra.name}"?`)) start(async () => { await deleteVendorExtra(extra.id); }); }}>
              Delete
            </button>
          </div>
        </>
      ) : (
        <form className="space-y-2" action={(fd) => start(async () => {
          setErr(null);
          const r = await saveVendorExtra(fd);
          if ("error" in r) setErr(r.error); else setEdit(false);
        })}>
          <input type="hidden" name="id" value={extra.id} />
          <input className="field" name="name" defaultValue={extra.name} />
          <input className="field" name="description" defaultValue={extra.description ?? ""} placeholder="Description" />
          <PriceFields extra={extra} />
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
