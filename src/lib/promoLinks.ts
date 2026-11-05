/**
 * Links that promo QR codes open. Pure (no server imports), so pages build the
 * URLs and pass them to client components.
 *
 * A promo link opens the order form with the code ready to apply (and, for a
 * laundry's own code, that laundry chosen). Signed-out visitors sign in or
 * create an account first and come straight back to it.
 */
export function promoOrderUrl(site: string, code: string, vendorSlug?: string | null): string {
  const q = new URLSearchParams();
  if (vendorSlug) q.set("vendor", vendorSlug);
  q.set("promo", code.toUpperCase());
  return `${site.replace(/\/$/, "")}/customer/order?${q.toString()}`;
}

/** A promo code as it may arrive in a link: letters, digits, - and _ only. */
export function cleanPromoParam(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{2,40}$/.test(s) ? s : null;
}
