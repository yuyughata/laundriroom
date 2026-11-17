"use client";

import { useState, useTransition } from "react";
import { updateItemPrice, renameVendorItem, deleteVendorItem } from "../actions";
import { SERVICE_LABEL } from "@/lib/format";
import type { ServiceType } from "@/lib/database.types";

export type ManagedItem = {
  priceId: string;
  itemTypeId: string;
  name: string;
  service: ServiceType;
  price: number;
  vendorOwned: boolean;
};

export function ItemsManager({ items, vendorId }: { items: ManagedItem[]; vendorId: string }) {
  if (items.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate">
        No items priced yet. Add one from the <span className="text-ink">Requests</span> tab — approved requests
        show up here to edit.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      {items.map((it) => <ItemRow key={it.priceId} item={it} vendorId={vendorId} />)}
    </div>
  );
}

function ItemRow({ item, vendorId }: { item: ManagedItem; vendorId: string }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== item.name || price !== String(item.price);

  function save() {
    setErr(null); setSaved(false);
    start(async () => {
      if (item.vendorOwned && name.trim() !== item.name) {
        const r = await renameVendorItem(item.itemTypeId, vendorId, name);
        if (r && "error" in r && r.error) { setErr(r.error); return; }
      }
      if (price !== String(item.price)) {
        const r = await updateItemPrice(item.priceId, vendorId, Number(price));
        if (r && "error" in r && r.error) { setErr(r.error); return; }
      }
      setSaved(true);
    });
  }

  function remove() {
    if (!window.confirm(`Remove "${item.name}" (${SERVICE_LABEL[item.service]}) from your price list?`)) return;
    setErr(null);
    start(async () => {
      const r = await deleteVendorItem(item.priceId, vendorId);
      if (r && "error" in r && r.error) setErr(r.error);
    });
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1">
          <label className="label">Item</label>
          <input className="field" value={name} disabled={!item.vendorOwned || pending}
            onChange={(e) => setName(e.target.value)} />
          {!item.vendorOwned && <p className="mt-1 text-[11px] text-slate">Shared catalogue name — ask laundriroom to rename.</p>}
        </div>
        <div className="w-28">
          <label className="label">Service</label>
          <input className="field bg-ink/5" value={SERVICE_LABEL[item.service]} disabled readOnly />
        </div>
        <div className="w-32">
          <label className="label">Price (₦)</label>
          <input className="field" inputMode="numeric" value={price} disabled={pending}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary px-3 py-2 text-xs" disabled={pending || !dirty} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button className="btn-ghost px-3 py-2 text-xs text-danger" disabled={pending} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      {saved && !err && <p className="mt-2 text-xs text-teal">Saved.</p>}
    </div>
  );
}
