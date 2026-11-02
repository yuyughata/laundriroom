"use client";

import { useState, useTransition } from "react";
import { requestItemType, decideItemType } from "../actions";
import { money, dateTime } from "@/lib/format";
import type { ItemTypeRequest } from "@/lib/database.types";

export function NewRequestForm({ vendorId }: { vendorId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  return (
    <div className="card p-4">
      <p className="label">Request a new item type</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="field" placeholder="Item name (e.g. Kaftan)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" inputMode="numeric" placeholder="Suggested price (optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <button className="btn-primary mt-3" disabled={pending || !name}
        onClick={() => start(async () => {
          setErr(null);
          const fd = new FormData();
          fd.set("vendor_id", vendorId); fd.set("item_name", name); if (price) fd.set("price", price);
          const r = await requestItemType(fd);
          if (r?.error) setErr(r.error); else { setName(""); setPrice(""); }
        })}>
        Send for approval
      </button>
      <p className="mt-2 text-xs text-slate">A manager approves before it joins the catalogue.</p>
    </div>
  );
}

export function RequestRow({ req, canDecide }: { req: ItemTypeRequest; canDecide: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="card flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-medium text-ink">{req.item_name}</p>
        <p className="text-xs text-slate">
          {req.price ? `${money(req.price)} · ` : ""}{dateTime(req.created_at)}
        </p>
      </div>
      {req.status === "pending" ? (
        canDecide ? (
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" disabled={pending}
              onClick={() => start(() => decideItemType(req.id, false).then(() => {}))}>Reject</button>
            <button className="btn-primary text-xs" disabled={pending}
              onClick={() => start(() => decideItemType(req.id, true).then(() => {}))}>Approve</button>
          </div>
        ) : <span className="chip-warn">Pending</span>
      ) : (
        <span className={req.status === "approved" ? "chip-ok" : "chip-muted"}>
          {req.status === "approved" ? "Approved" : "Rejected"}
        </span>
      )}
    </div>
  );
}
