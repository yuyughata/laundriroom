// Server-side only. Works out the delivery fee for an order.
import { drivingDistanceKm, geocode, addressText, mapsConfigured, type LatLng } from "@/lib/maps";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export type PricingSettings = {
  mode: "flat" | "distance";
  flat: number;
  perKm: number;
  base: number;
  min: number;
};

export type DeliveryQuote = {
  fee: number;
  /** Driving km, when the fee was priced by distance. */
  km: number | null;
  /** How the fee was actually worked out. */
  pricedBy: "flat" | "distance";
  /** Why distance pricing fell back to the flat fee, if it did. */
  note?: string;
};

/** The admin's delivery pricing (falls back to flat if 0035 isn't applied yet). */
export async function loadPricing(db: Db): Promise<PricingSettings> {
  const [{ data: rule }, { data: s, error }] = await Promise.all([
    db.from("delivery_fee_rules").select("flat_amount").eq("scope", "global").eq("active", true).limit(1).maybeSingle(),
    db.from("platform_settings")
      .select("delivery_pricing, delivery_per_km, delivery_base_fare, delivery_min_fee").eq("id", true).maybeSingle(),
  ]);
  const flat = Number(rule?.flat_amount ?? 0);
  if (error || !s) return { mode: "flat", flat, perKm: 0, base: 0, min: 0 };
  return {
    mode: s.delivery_pricing === "distance" ? "distance" : "flat",
    flat,
    perKm: Number(s.delivery_per_km ?? 0),
    base: Number(s.delivery_base_fare ?? 0),
    min: Number(s.delivery_min_fee ?? 0),
  };
}

/** Distance fare: base + per-km × km, at least the minimum, rounded up to ₦50. */
export function distanceFare(p: PricingSettings, km: number): number {
  const raw = Math.max(p.min, p.base + p.perKm * km);
  return Math.ceil(raw / 50) * 50;
}

type Place = { lat?: number | null; lng?: number | null; address_line?: string | null; line1?: string | null; area?: string | null; city?: string | null };

async function coords(p: Place | null | undefined): Promise<LatLng | null> {
  if (!p) return null;
  if (typeof p.lat === "number" && typeof p.lng === "number") return { lat: p.lat, lng: p.lng };
  const text = addressText(p);
  return text ? geocode(text) : null;
}

/**
 * Price one delivery from a branch to a customer address. Flat unless the
 * admin chose distance pricing and Google Maps can measure the trip.
 */
export async function quoteDelivery(pricing: PricingSettings, from: Place | null, to: Place | null): Promise<DeliveryQuote> {
  const flat: DeliveryQuote = { fee: pricing.flat, km: null, pricedBy: "flat" };
  if (pricing.mode !== "distance") return flat;
  if (!mapsConfigured()) return { ...flat, note: "Google Maps isn't connected; using the flat fee." };
  const [a, b] = await Promise.all([coords(from), coords(to)]);
  if (!a) return { ...flat, note: "The branch isn't on the map yet; using the flat fee." };
  if (!b) return { ...flat, note: "We couldn't find that address on the map; using the flat fee." };
  const km = await drivingDistanceKm(a, b);
  if (km == null) return { ...flat, note: "We couldn't measure the distance; using the flat fee." };
  return { fee: distanceFare(pricing, km), km, pricedBy: "distance" };
}
