"use client";

import { useState, useTransition } from "react";
import { createPromo, togglePromo } from "./actions";
import { money, dateShort } from "@/lib/format";
import type { PromoCode } from "@/lib/database.types";

export function NewPromo() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) return <button className="btn-primary text-sm" onClick={() => setOpen(true)}>New promo code</button>;

  return (
    <form className="card max-w-xl space-y-3 p-5" action={(fd) => start(async () => {
      setErr(null);
      const r = await createPromo(fd);
      if (r?.error) setErr(r.error); else setOpen(false);
    })}>
      <p className="font-medium text-ink">New promo code</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Code</label><input name="code" className="field uppercase" placeholder="WELCOME20" /></div>
        <div><label className="label">Type</label>
          <select name="discount_type" className="field"><option value="percent">Percent (%)</option><option value="fixed">Fixed (₦)</option></select>
        </div>
        <div><label className="label">Value</label><input name="value" className="field" inputMode="numeric" placeholder="20 or 1000" /></div>
        <div><label className="label">Max discount (₦, percent only)</label><input name="max_discount" className="field" inputMode="numeric" placeholder="optional" /></div>
        <div><label className="label">Usage limit (total)</label><input name="usage_limit" className="field" inputMode="numeric" placeholder="blank = unlimited" /></div>
        <div><label className="label">Per customer</label><input name="per_customer_limit" className="field" inputMode="numeric" defaultValue="1" /></div>
        <div><label className="label">Min order (₦)</label><input name="min_order" className="field" inputMode="numeric" defaultValue="0" /></div>
        <div><label className="label">Expires</label><input name="expires_at" type="date" className="field" /></div>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={pending}>Create</button>
        <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function PromoRow({ promo, fundedBy }: { promo: PromoCode; fundedBy: string }) {
  const [pending, start] = useTransition();
  const discount = promo.discount_type === "percent"
    ? `${promo.value}%${promo.max_discount ? ` (max ${money(promo.max_discount)})` : ""}`
    : money(promo.value);
  return (
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
    </tr>
  );
}
