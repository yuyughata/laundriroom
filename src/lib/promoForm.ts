/**
 * Shared promo-code form parsing for vendor (vendor-funded) and admin
 * (platform-funded) promos. A code is a flat % / ₦ discount, or tiered by order
 * value — one code whose % depends on the subtotal (0062).
 */

export type PromoFields = {
  discount_type: "percent" | "fixed";
  value: number;
  max_discount: number | null;
  min_order: number;
  tiers: { min: number; pct: number }[] | null;
};

export function parsePromoFields(formData: FormData): { error: string } | PromoFields {
  const max_discount = formData.get("max_discount") ? Number(formData.get("max_discount")) : null;
  if (max_discount !== null && !(max_discount > 0)) return { error: "Max discount must be greater than 0 (or leave it blank)." };

  if (String(formData.get("mode") || "flat") === "tiered") {
    let raw: unknown;
    try { raw = JSON.parse(String(formData.get("tiers") || "[]")); } catch { return { error: "Couldn't read the tiers." }; }
    const tiers = (Array.isArray(raw) ? raw : [])
      .map((t) => ({ min: Math.round(Number((t as { min?: unknown }).min)), pct: Number((t as { pct?: unknown }).pct) }))
      .filter((t) => Number.isFinite(t.min) && t.min >= 0 && Number.isFinite(t.pct) && t.pct > 0 && t.pct <= 100)
      .map((t) => ({ min: t.min, pct: Math.round(t.pct * 100) / 100 }))
      .sort((a, b) => a.min - b.min);
    if (tiers.length === 0) return { error: "Add at least one tier (a minimum order and a %)." };
    for (let i = 1; i < tiers.length; i++) if (tiers[i].min === tiers[i - 1].min) return { error: "Each tier needs a different minimum order." };
    return { discount_type: "percent", value: 0, max_discount, min_order: 0, tiers };
  }

  const discount_type = String(formData.get("discount_type") || "percent") === "fixed" ? "fixed" : "percent";
  const value = Number(formData.get("value") || 0);
  if (!(value > 0)) return { error: "Enter a discount value." };
  if (discount_type === "percent" && value > 100) return { error: "A percentage can't be more than 100." };
  const minRaw = Number(formData.get("min_order") || 0);
  return { discount_type, value, max_discount, min_order: Number.isFinite(minRaw) && minRaw > 0 ? Math.round(minRaw) : 0, tiers: null };
}

/** A readable summary of a code's discount for lists (flat or tiered). */
export function promoDiscountLabel(
  p: { discount_type: "percent" | "fixed"; value: number; max_discount: number | null; tiers?: { min: number; pct: number }[] | null },
  money: (n: number) => string,
): string {
  if (p.tiers?.length) {
    return p.tiers.map((t) => `${t.pct}% ≥ ${money(t.min)}`).join(" · ") + (p.max_discount ? ` (max ${money(p.max_discount)})` : "");
  }
  return p.discount_type === "percent"
    ? `${p.value}%${p.max_discount ? ` (max ${money(p.max_discount)})` : ""}`
    : money(p.value);
}
