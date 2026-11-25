"use client";

import { useState } from "react";
import type { PromoCode } from "@/lib/database.types";

type TierRow = { min: string; pct: string };

/**
 * The discount portion of a promo form — a flat % / ₦, or tiers by order value
 * (0062). Shared by Vendor → Promos and Admin → Promos. Emits hidden `mode` and
 * `tiers` inputs plus `discount_type`/`value`/`max_discount`/`min_order`, which
 * `parsePromoFields` reads.
 */
export function PromoDiscountFields({ p, showMinOrder = false }: { p?: PromoCode; showMinOrder?: boolean }) {
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

      <div>
        <label className="label">Discount style</label>
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          <button type="button" onClick={() => setMode("flat")}
            className={`rounded-card border p-2 text-xs ${mode === "flat" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>Flat</button>
          <button type="button" onClick={() => setMode("tiered")}
            className={`rounded-card border p-2 text-xs ${mode === "tiered" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink"}`}>Tiered by order value</button>
        </div>
      </div>

      {mode === "flat" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Type</label>
            <select name="discount_type" className="field" defaultValue={p?.discount_type ?? "percent"}>
              <option value="percent">Percent (%)</option><option value="fixed">Fixed (₦)</option>
            </select>
          </div>
          <div><label className="label">Value</label>
            <input name="value" className="field" inputMode="numeric" placeholder="10 or 500" defaultValue={p?.tiers?.length ? "" : p?.value} /></div>
          {showMinOrder && (
            <div><label className="label">Min order (₦)</label>
              <input name="min_order" className="field" inputMode="numeric" defaultValue={p?.tiers?.length ? 0 : p?.min_order ?? 0} /></div>
          )}
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

      <div className="sm:max-w-sm">
        <label className="label">Max discount (₦, optional cap)</label>
        <input name="max_discount" className="field" inputMode="numeric" placeholder="optional" defaultValue={p?.max_discount ?? ""} />
      </div>
    </div>
  );
}
