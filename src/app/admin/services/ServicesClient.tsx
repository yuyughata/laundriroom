"use client";

import { useState, useTransition } from "react";
import { saveExtra, toggleExtra, deleteExtra, setWashDry } from "../actions";
import { money } from "@/lib/format";
import type { ServiceExtra } from "@/lib/database.types";

/** How an extra's price reads in lists: "10% of items" or a fixed ₦ amount. */
function extraPriceLabel(e: Pick<ServiceExtra, "price" | "price_type" | "percent">) {
  return e.price_type === "percent"
    ? `${Number(e.percent ?? 0)}% of items`
    : money(e.price);
}

/** Shared Fixed-₦ / Percentage price control for the new + edit extra forms. */
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

export function NewExtra() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>Add extra</button>;

  return (
    <form className="card max-w-md space-y-3 p-5" action={(fd) => start(async () => {
      setErr(null);
      const r = await saveExtra(fd);
      if (r?.error) setErr(r.error); else setOpen(false);
    })}>
      <p className="font-medium text-ink">New premium extra</p>
      <input className="field" name="name" placeholder="Name (e.g. Premium detergent)" />
      <input className="field" name="description" placeholder="Short description (optional)" />
      <PriceFields />
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={pending}>Save</button>
        <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function ExtraCard({ extra }: { extra: ServiceExtra }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className={`card p-4 ${!extra.active ? "opacity-60" : ""}`}>
      {!edit ? (
        <>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-ink">{extra.name}</p>
              {extra.description && <p className="text-xs text-slate">{extra.description}</p>}
            </div>
            <p className="font-display text-lg text-ink">{extraPriceLabel(extra)}</p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEdit(true)}>Edit</button>
            <button className={extra.active ? "chip-ok" : "chip-muted"} disabled={pending}
              onClick={() => start(() => toggleExtra(extra.id, !extra.active).then(() => {}))}>
              {extra.active ? "Active" : "Hidden"}
            </button>
            <button className="btn-ghost border-danger/30 px-3 py-1.5 text-xs text-danger" disabled={pending}
              onClick={() => { if (confirm(`Delete "${extra.name}"?`)) start(() => deleteExtra(extra.id).then(() => {})); }}>
              Delete
            </button>
          </div>
        </>
      ) : (
        <form className="space-y-2" action={(fd) => start(async () => {
          setErr(null);
          const r = await saveExtra(fd);
          if (r?.error) setErr(r.error); else setEdit(false);
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

/** Admin: the flat wash-&-dry-only price + qualifying clothes count. */
export function WashDryEditor({ price, minItems, commission }: { price: number; minItems: number; commission: number }) {
  const [p, setP] = useState(String(price || ""));
  const [n, setN] = useState(String(minItems || ""));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const base = Number(p) || 0;
  const customer = Math.round(base * (1 + (commission || 0)));
  const on = base > 0;

  return (
    <div className="card mt-4 max-w-xl p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="wd-price">Price the laundry receives (₦)</label>
          <input id="wd-price" className="field" inputMode="numeric" value={p}
            onChange={(e) => { setP(e.target.value.replace(/[^\d.]/g, "")); setMsg(null); }} placeholder="e.g. 5000" />
        </div>
        <div>
          <label className="label" htmlFor="wd-min">Clothes that qualify</label>
          <input id="wd-min" className="field" inputMode="numeric" value={n}
            onChange={(e) => { setN(e.target.value.replace(/[^\d]/g, "")); setMsg(null); }} placeholder="e.g. 20" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate">
        {on
          ? <>Customer pays <span className="font-medium text-ink">{money(customer)}</span> (your {Math.round((commission || 0) * 1000) / 10}% commission added on top){minItems || Number(n) ? <> · for {Number(n) || minItems}+ clothes</> : null}.</>
          : "Set a price above ₦0 to offer wash & dry only."}
      </p>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      {msg && <p className="mt-2 text-xs text-teal">{msg}</p>}
      <button className="btn-primary mt-4 text-sm" disabled={pending}
        onClick={() => { setErr(null); setMsg(null); start(async () => {
          const r = await setWashDry(Number(p) || 0, Number(n) || 0);
          if (r?.error) setErr(r.error); else setMsg(Number(p) > 0 ? "Saved." : "Saved — wash & dry only is now off.");
        }); }}>
        Save
      </button>
    </div>
  );
}
