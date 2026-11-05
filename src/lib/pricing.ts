// laundriroom's commission is added on top of the vendor's own prices
// (migration 0041). Mirrors set_item_customer_price: rounded to the whole naira.
export function customerPrice(vendorPrice: number, rate: number | null | undefined): number {
  const r = Number(rate ?? 0);
  if (!r) return Number(vendorPrice);
  // to kobo first so float noise (150 × 1.15 = 172.4999…) rounds like Postgres numeric
  return Math.round(Math.round(Number(vendorPrice) * (1 + r) * 100) / 100);
}

/** An item's price to the customer, from its snapshot (older items have none). */
export function itemCustomerPrice(it: { price_at_checkin: number; customer_price?: number | null }): number {
  return Number(it.customer_price ?? it.price_at_checkin);
}
