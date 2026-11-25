"use client";

import { useState, useTransition } from "react";
import { createPromo, togglePromo, updatePromo, deletePromo } from "./actions";
import { money, dateShort } from "@/lib/format";
import { promoDiscountLabel } from "@/lib/promoForm";
import { PromoDiscountFields } from "@/components/promo/PromoDiscountFields";
import { QrCard } from "@/components/promo/QrCard";
import type { PromoCode } from "@/lib/database.types";

/** Shared promo field grid, prefilled for editing. Flat % / ₦, or tiers by order value. */
function PromoFields({ p }: { p?: PromoCode }) {
  return (
    <div className="space-y-3">
      <div><label className="label">Code</label><input name="code" className="field uppercase" placeholder="WELCOME20" defaultValue={p?.code} /></div>
      <PromoDiscountFields p={p} showMinOrder />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Usage limit (total)</label><input name="usage_limit" className="field" inputMode="numeric" placeholder="blank = unlimited" defaultValue={p?.usage_limit ?? ""} /></div>
        <div><label className="label">Per customer</label><input name="per_customer_limit" className="field" inputMode="numeric" defaultValue={p?.per_customer_limit ?? 1} /></div>
        <div><label className="label">Expires</label><input name="expires_at" type="date" className="field" defaultValue={p?.expires_at ? p.expires_at.slice(0, 10) : ""} /></div>
      </div>
    </div>
  );
}

export function NewPromo() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) return <button className="btn-primary text-sm" onClick={() => setOpen(true)}>New promo code</button>;

  return (
    <form className="card max-w-xl space-y-3 p-5" action={(fd) => start(async () => {
      setErr(null);
      const r = await createPromo(fd);
      if (r && "error" in r && r.error) setErr(r.error); else setOpen(false);
    })}>
      <p className="font-medium text-ink">New promo code</p>
      <PromoFields />
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={pending}>Create</button>
        <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function PromoRow({ promo, fundedBy, qrUrl }: { promo: PromoCode; fundedBy: string; qrUrl: string }) {
  const [pending, start] = useTransition();
  const [showQr, setShowQr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const discount = promoDiscountLabel(promo, money);

  function remove() {
    if (!window.confirm(`Delete promo code ${promo.code}? This can’t be undone.`)) return;
    setErr(null);
    start(async () => {
      const r = await deletePromo(promo.id);
      if (r && "error" in r && r.error) setErr(r.error);
    });
  }

  return (
    <>
    <tr className={promo.active ? "" : "opacity-60"}>
      <td className="px-4 py-3 font-medium text-ink">{promo.code}{promo.owner_id ? " 🎁" : ""}</td>
      <td className="px-4 py-3 text-slate">{discount}</td>
      <td className="px-4 py-3">
        <span className={promo.vendor_id ? "chip-warn" : "chip-ink"}>{fundedBy}</span>
      </td>
      <td className="px-4 py-3 text-slate">{promo.used_count}{promo.usage_limit ? ` / ${promo.usage_limit}` : ""}</td>
      <td className="px-4 py-3 text-slate">{promo.expires_at ? dateShort(promo.expires_at) : "—"}</td>
      <td className="px-4 py-3">
        <button className={promo.active ? "chip-ok" : "chip-muted"} disabled={pending}
          onClick={() => start(() => togglePromo(promo.id, !promo.active).then(() => {}))}>
          {promo.active ? "Active" : "Off"}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-1">
          <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => { setEditing((v) => !v); setErr(null); }}>
            {editing ? "Close" : "Edit"}
          </button>
          <button type="button" className="btn-ghost px-3 py-1 text-xs" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
            {showQr ? "Hide QR" : "QR code"}
          </button>
          <button type="button" className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending} onClick={remove}>
            Delete
          </button>
        </div>
      </td>
    </tr>
    {err && (
      <tr><td colSpan={7} className="px-4 pb-3 text-sm text-danger">{err}</td></tr>
    )}
    {editing && (
      <tr className="bg-ivory/60">
        <td colSpan={7} className="px-4 py-4">
          <form className="space-y-3" action={(fd) => start(async () => {
            setErr(null);
            const r = await updatePromo(promo.id, fd);
            if (r && "error" in r && r.error) setErr(r.error); else setEditing(false);
          })}>
            <p className="font-medium text-ink">Edit {promo.code}</p>
            <PromoFields p={promo} />
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
        <td colSpan={7} className="px-4 py-3">
          <QrCard compact title={`Promo ${promo.code}`} code={promo.code} url={qrUrl}
            fileName={`laundriroom-promo-${promo.code.toLowerCase()}-qr`}
            note={promo.active ? "Opens the order form with this code ready to apply. People who aren’t signed in sign up first, then come straight back." : "This code is switched off — scans won’t give a discount until it’s active."} />
        </td>
      </tr>
    )}
    </>
  );
}
