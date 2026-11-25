"use client";

import { useState, useTransition } from "react";
import { createVendorPromo, toggleVendorPromo, updateVendorPromo, deleteVendorPromo } from "../actions";
import { money, dateShort } from "@/lib/format";
import { QrCard } from "@/components/promo/QrCard";
import type { PromoCode } from "@/lib/database.types";

type TierRow = { min: string; pct: string };

/** Shared vendor promo field grid, prefilled for editing. Flat % / ₦, or tiers by order value. */
function VendorPromoFields({ p }: { p?: PromoCode }) {
  const [mode, setMode] = useState<"flat" | "tiered">(p?.tiers?.length ? "tiered" : "flat");
  const [tiers, setTiers] = useState<TierRow[]>(
    p?.tiers?.length ? p.tiers.map((t) => ({ min: String(t.min), pct: String(t.pct) })) : [{ min: "", pct: "" }],
  );

  const setTier = (i: number, k: keyof TierRow, v: string) =>
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v.replace(/[^\d.]/g, "") } : t)));
  const addTier = () => setTiers((ts) => [...ts, { min: "", pct: "" }]);
  const removeTier = (i: number) => setTiers((ts) => (ts.length > 1 ? ts.filter((_, j) => j !== i) : ts));

  const tiersJson = JSON.stringify(
    tiers.map((t) => ({ min: Number(t.min) || 0, pct: Number(t.pct) || 0 })).filter((t) => t.pct > 0),
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="tiers" value={tiersJson} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Code</label><input name="code" className="field uppercase" placeholder="FOLD10" defaultValue={p?.code} /></div>
        <div>
          <label className="label">Discount style</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode("flat")}
              className={`rounded-card border p-2 text-xs ${mode === "flat" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>Flat</button>
            <button type="button" onClick={() => setMode("tiered")}
              className={`rounded-card border p-2 text-xs ${mode === "tiered" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>Tiered by order value</button>
          </div>
        </div>
      </div>

      {mode === "flat" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Type</label>
            <select name="discount_type" className="field" defaultValue={p?.discount_type ?? "percent"}>
              <option value="percent">Percent (%)</option><option value="fixed">Fixed (₦)</option>
            </select>
          </div>
          <div><label className="label">Value</label><input name="value" className="field" inputMode="numeric" placeholder="10 or 500" defaultValue={p?.tiers?.length ? "" : p?.value} /></div>
        </div>
      ) : (
        <div>
          <label className="label">Tiers — a % once the order reaches each minimum</label>
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate">₦</span>
                <input className="field" inputMode="numeric" placeholder="min order (e.g. 3000)" value={t.min}
                  onChange={(e) => setTier(i, "min", e.target.value)} />
                <span className="text-xs text-slate">→</span>
                <input className="field w-24" inputMode="decimal" placeholder="%" value={t.pct}
                  onChange={(e) => setTier(i, "pct", e.target.value)} />
                <span className="text-xs text-slate">%</span>
                <button type="button" className="btn-ghost px-2 py-1 text-xs text-danger" onClick={() => removeTier(i)} aria-label="Remove tier">✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost mt-2 text-xs" onClick={addTier}>+ Add tier</button>
          <p className="mt-1 text-xs text-slate">The order gets the highest tier it reaches. Below the lowest minimum, the code gives no discount.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Max discount (₦, optional cap)</label><input name="max_discount" className="field" inputMode="numeric" placeholder="optional" defaultValue={p?.max_discount ?? ""} /></div>
        <div><label className="label">Usage limit</label><input name="usage_limit" className="field" inputMode="numeric" placeholder="blank = unlimited" defaultValue={p?.usage_limit ?? ""} /></div>
        <div><label className="label">Per customer</label><input name="per_customer_limit" className="field" inputMode="numeric" defaultValue={p?.per_customer_limit ?? 1} /></div>
        <div><label className="label">Expires</label><input name="expires_at" type="date" className="field" defaultValue={p?.expires_at ? p.expires_at.slice(0, 10) : ""} /></div>
      </div>
    </div>
  );
}

export function NewVendorPromo({ vendorId, canManage }: { vendorId: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!canManage) return null;
  if (!open) return <button className="btn-primary text-sm" onClick={() => setOpen(true)}>New promo</button>;

  return (
    <form className="card max-w-xl space-y-3 p-5" action={(fd) => start(async () => {
      setErr(null);
      const r = await createVendorPromo(fd);
      if (r && "error" in r && r.error) setErr(r.error); else setOpen(false);
    })}>
      <input type="hidden" name="vendor_id" value={vendorId} />
      <p className="font-medium text-ink">New promo (vendor-funded)</p>
      <VendorPromoFields />
      <p className="text-xs text-warn">This discount comes out of your payout, not the platform.</p>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={pending}>Create</button>
        <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function VendorPromoRow({ promo, canManage, qrUrl }: { promo: PromoCode; canManage: boolean; qrUrl: string }) {
  const [pending, start] = useTransition();
  const [showQr, setShowQr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const discount = promo.tiers?.length
    ? promo.tiers.map((t) => `${t.pct}% ≥ ${money(t.min)}`).join(" · ") + (promo.max_discount ? ` (max ${money(promo.max_discount)})` : "")
    : promo.discount_type === "percent"
    ? `${promo.value}%${promo.max_discount ? ` (max ${money(promo.max_discount)})` : ""}`
    : money(promo.value);

  function remove() {
    if (!window.confirm(`Delete promo code ${promo.code}? This can’t be undone.`)) return;
    setErr(null);
    start(async () => {
      const r = await deleteVendorPromo(promo.id);
      if (r && "error" in r && r.error) setErr(r.error);
    });
  }

  return (
    <>
    <tr className={promo.active ? "" : "opacity-60"}>
      <td className="px-4 py-3 font-medium text-ink">{promo.code}</td>
      <td className="px-4 py-3 text-slate">{discount}</td>
      <td className="px-4 py-3 text-slate">{promo.used_count}{promo.usage_limit ? ` / ${promo.usage_limit}` : ""}</td>
      <td className="px-4 py-3 text-slate">{promo.expires_at ? dateShort(promo.expires_at) : "—"}</td>
      <td className="px-4 py-3">
        {canManage ? (
          <button className={promo.active ? "chip-ok" : "chip-muted"} disabled={pending}
            onClick={() => start(() => toggleVendorPromo(promo.id, !promo.active).then(() => {}))}>
            {promo.active ? "Active" : "Off"}
          </button>
        ) : <span className={promo.active ? "chip-ok" : "chip-muted"}>{promo.active ? "Active" : "Off"}</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-1">
          {canManage && (
            <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => { setEditing((v) => !v); setErr(null); }}>
              {editing ? "Close" : "Edit"}
            </button>
          )}
          <button type="button" className="btn-ghost px-3 py-1 text-xs" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
            {showQr ? "Hide QR" : "QR code"}
          </button>
          {canManage && (
            <button type="button" className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending} onClick={remove}>
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
    {err && (
      <tr><td colSpan={6} className="px-4 pb-3 text-sm text-danger">{err}</td></tr>
    )}
    {editing && canManage && (
      <tr className="bg-ivory/60">
        <td colSpan={6} className="px-4 py-4">
          <form className="space-y-3" action={(fd) => start(async () => {
            setErr(null);
            const r = await updateVendorPromo(promo.id, fd);
            if (r && "error" in r && r.error) setErr(r.error); else setEditing(false);
          })}>
            <p className="font-medium text-ink">Edit {promo.code}</p>
            <VendorPromoFields p={promo} />
            <p className="text-xs text-warn">This discount comes out of your payout, not the platform.</p>
            <div className="flex gap-2">
              <button className="btn-primary text-sm" disabled={pending}>Save changes</button>
              <button type="button" className="btn-ghost text-sm" onClick={() => { setEditing(false); setErr(null); }}>Cancel</button>
            </div>
          </form>
        </td>
      </tr>
    )}
    {showQr && (
      <tr className="bg-ivory/60">
        <td colSpan={6} className="px-4 py-3">
          <QrCard compact title={`Promo ${promo.code}`} code={promo.code} url={qrUrl}
            fileName={`promo-${promo.code.toLowerCase()}-qr`}
            note={promo.active ? "Opens your order form with this code ready to apply. New customers sign up first, then come straight back." : "This code is switched off — scans won’t give a discount until it’s active."} />
        </td>
      </tr>
    )}
    </>
  );
}
