"use client";

import { useState, useTransition } from "react";
import { updateItemPrice, updateItemService, renameVendorItem, deleteVendorItem, addVendorItem } from "../actions";
import { SERVICE_LABEL } from "@/lib/format";
import type { ServiceType } from "@/lib/database.types";

const SERVICES: ServiceType[] = ["wash_and_fold", "dry_clean", "press_only"];

export function NewItemForm({ vendorId }: { vendorId: string }) {
  const [name, setName] = useState("");
  const [service, setService] = useState<ServiceType>("wash_and_fold");
  const [price, setPrice] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="card p-4">
      <p className="label">Add an item</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_8rem_auto] sm:items-end">
        <div>
          <label className="label">Item</label>
          <input className="field" placeholder="e.g. Kaftan" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Service</label>
          <select className="field" value={service} onChange={(e) => setService(e.target.value as ServiceType)}>
            {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Price (₦)</label>
          <input className="field" inputMode="numeric" value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
        </div>
        <button className="btn-primary px-4 py-2 text-sm" disabled={pending || !name || price === ""}
          onClick={() => start(async () => {
            setErr(null);
            const r = await addVendorItem(vendorId, name, service, Number(price));
            if (r && "error" in r && r.error) setErr(r.error);
            else { setName(""); setPrice(""); setService("wash_and_fold"); }
          })}>
          {pending ? "Adding…" : "Add item"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <p className="mt-2 text-xs text-slate">Added straight to your price list — no approval needed.</p>
    </div>
  );
}

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
  const [service, setService] = useState<ServiceType>(item.service);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== item.name || price !== String(item.price) || service !== item.service;

  function save() {
    setErr(null); setSaved(false);
    start(async () => {
      if (item.vendorOwned && name.trim() !== item.name) {
        const r = await renameVendorItem(item.itemTypeId, vendorId, name);
        if (r && "error" in r && r.error) { setErr(r.error); return; }
      }
      if (service !== item.service) {
        const r = await updateItemService(item.priceId, vendorId, service);
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
        <div className="w-36">
          <label className="label">Service</label>
          <select className="field" value={service} disabled={pending}
            onChange={(e) => setService(e.target.value as ServiceType)}>
            {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
          </select>
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
