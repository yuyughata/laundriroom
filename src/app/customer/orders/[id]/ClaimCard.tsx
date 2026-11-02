"use client";

import { useState, useTransition } from "react";
import { createClaim } from "../../actions";
import type { OrderItem, Claim, ClaimStatus } from "@/lib/database.types";

const STATUS_LABEL: Record<ClaimStatus, string> = {
  open: "Open", investigating: "Investigating", approved: "Approved",
  rejected: "Rejected", resolved: "Resolved",
};
const chip = (s: ClaimStatus) =>
  s === "resolved" || s === "approved" ? "chip-ok" : s === "rejected" ? "chip-muted" : "chip-warn";

export function ClaimCard({ orderId, items, claims }: { orderId: string; items: OrderItem[]; claims: Claim[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-ink">A problem with an item?</p>
          <p className="text-xs text-slate">Report damage or a missing item — we&apos;ll use the check-in evidence to resolve it.</p>
        </div>
        {!open && <button className="btn-ghost text-xs" onClick={() => setOpen(true)}>Report</button>}
      </div>

      {claims.length > 0 && (
        <div className="mt-3 space-y-2">
          {claims.map((c) => (
            <div key={c.id} className="rounded-card border border-ink/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">#{c.number} · {c.type === "loss" ? "Lost item" : "Damage"}</p>
                <span className={chip(c.status)}>{STATUS_LABEL[c.status]}</span>
              </div>
              <p className="mt-1 text-xs text-slate">{c.description}</p>
              {c.resolution_note && <p className="mt-1 text-xs text-ink">Resolution: {c.resolution_note}</p>}
              {c.compensation > 0 && <p className="text-xs text-teal">Compensation: ₦{Number(c.compensation).toLocaleString()}</p>}
            </div>
          ))}
        </div>
      )}

      {open && (
        <form className="mt-4 space-y-3" action={(fd) => start(async () => {
          setErr(null);
          const r = await createClaim(fd);
          if (r?.error) setErr(r.error); else setOpen(false);
        })}>
          <input type="hidden" name="order_id" value={orderId} />
          <div className="grid grid-cols-2 gap-2">
            <select name="type" className="field">
              <option value="damage">Damaged item</option>
              <option value="loss">Lost / missing item</option>
            </select>
            <select name="order_item_id" className="field">
              <option value="">Whole order</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.sub_code}</option>)}
            </select>
          </div>
          <textarea name="description" rows={3} className="field" placeholder="Describe what happened" />
          {err && <p className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-sm" disabled={pending}>Submit claim</button>
            <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
