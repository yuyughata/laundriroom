"use client";

import { useState, useTransition } from "react";
import { setBulkDiscount } from "../actions";

/** Platform-funded bulk-order discount: qualify at N items, take X% off. */
export function BulkDiscount({ minItems, pct }: { minItems: number; pct: number }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState(String(minItems || ""));
  const [p, setP] = useState(pct ? String(pct) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const active = Number(n) > 0 && Number(p) > 0;

  return (
    <div className="rounded-card border border-ink/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg text-ink">Bulk order discount</p>
          <p className="text-sm text-slate">
            Platform-funded. When an order reaches the item threshold, the discount comes
            off the customer&apos;s total — vendor payouts are unaffected.
          </p>
        </div>
        <span className={active ? "chip-ok" : "chip-muted"}>{active ? "On" : "Off"}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Items to qualify</label>
          <input className="field max-w-[140px]" inputMode="numeric" placeholder="e.g. 5"
            value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <div>
          <label className="label">Discount %</label>
          <input className="field max-w-[140px]" inputMode="decimal" placeholder="e.g. 2"
            value={p} onChange={(e) => setP(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await setBulkDiscount(Number(n || 0), Number(p || 0));
              setMsg(r && "error" in r && r.error ? r.error : "Saved.");
            });
          }}>
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-slate">Set items to 0 to switch it off.</span>
        {msg && <span className="text-xs text-teal">{msg}</span>}
      </div>
    </div>
  );
}
