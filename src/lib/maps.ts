// Server-side only: imported by server actions / server components, never by client code.

/**
 * Google Maps (server-side only — the key never reaches the browser).
 * Used for distance-based delivery pricing: branches and customer addresses
 * are geocoded when saved, and the driving distance between them prices the
 * delivery. Everything returns null when the key isn't set or Google can't
 * answer, and callers fall back to the flat delivery fee.
 *
 * Env: GOOGLE_MAPS_API_KEY (Geocoding API + Distance Matrix API enabled).
 */

const KEY = () => process.env.GOOGLE_MAPS_API_KEY || "";
// Override only for tests/staging stubs; production always talks to Google.
const BASE = () => (process.env.GOOGLE_MAPS_API_BASE || "https://maps.googleapis.com").replace(/\/$/, "");
export const mapsConfigured = () => !!KEY();

export type LatLng = { lat: number; lng: number };

/** Address text → coordinates (biased to Nigeria). */
export async function geocode(address: string): Promise<LatLng | null> {
  const key = KEY();
  const q = address.trim();
  if (!key || !q) return null;
  try {
    const url = `${BASE()}/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=ng&components=country:NG&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const body = await res.json();
    const loc = body?.results?.[0]?.geometry?.location;
    if (body?.status !== "OK" || typeof loc?.lat !== "number") return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

/** Driving distance in km between two points (Distance Matrix). */
export async function drivingDistanceKm(from: LatLng, to: LatLng): Promise<number | null> {
  const key = KEY();
  if (!key) return null;
  try {
    const url = `${BASE()}/maps/api/distancematrix/json?origins=${from.lat},${from.lng}` +
      `&destinations=${to.lat},${to.lng}&mode=driving&units=metric&region=ng&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const body = await res.json();
    const el = body?.rows?.[0]?.elements?.[0];
    if (body?.status !== "OK" || el?.status !== "OK" || typeof el?.distance?.value !== "number") return null;
    return Math.round((el.distance.value / 1000) * 10) / 10; // metres → km, 1 dp
  } catch {
    return null;
  }
}

/** One line for geocoding from address parts. */
export function addressText(parts: { address_line?: string | null; line1?: string | null; area?: string | null; city?: string | null }) {
  return [parts.address_line ?? parts.line1, parts.area, parts.city, "Nigeria"].filter((p) => p && String(p).trim()).join(", ");
}
