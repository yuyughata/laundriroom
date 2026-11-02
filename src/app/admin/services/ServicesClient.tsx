"use client";

import { useState, useTransition } from "react";
import { saveExtra, toggleExtra, deleteExtra } from "../actions";
import { money } from "@/lib/format";
import type { ServiceExtra } from "@/lib/database.types";

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
      <input className="field" name="price" inputMode="numeric" placeholder="Price (₦)" />
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
            <p className="font-display text-lg text-ink">{money(extra.price)}</p>
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
          <input className="field" name="price" defaultValue={String(extra.price)} inputMode="numeric" />
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
