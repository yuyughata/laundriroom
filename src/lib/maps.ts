// Server-side only: imported by server actions / server components, never by client code.

/**
 * Google Maps (server-side only — the key never reaches the browser).
 * Used for distance-based delivery pricing: branches and customer addresses
 * are geocoded when saved, and the driving distance between them prices the
 * delivery. Everything returns null when the key isn't set or Google can't
 * answer, and callers fall back to the flat delivery fee.
 *
 * Env: GOOGLE_MAPS_API_KEY with the Geocoding API and the Routes API enabled.
 * (Distance Matrix is legacy and can't be enabled on new Google Cloud
 * projects, so distances come from Routes API computeRoutes.)
 */

const KEY = () => process.env.GOOGLE_MAPS_API_KEY || "";
// Override only for tests/staging stubs; production always talks to Google.
const BASE = () => (process.env.GOOGLE_MAPS_API_BASE || "https://maps.googleapis.com").replace(/\/$/, "");
const ROUTES_BASE = () => (process.env.GOOGLE_MAPS_API_BASE || "https://routes.googleapis.com").replace(/\/$/, "");
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

/** Driving distance in km between two points (Routes API, driving, no traffic). */
export async function drivingDistanceKm(from: LatLng, to: LatLng): Promise<number | null> {
  const key = KEY();
  if (!key) return null;
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  try {
    const res = await fetch(`${ROUTES_BASE()}/directions/v2:computeRoutes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
      body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: "DRIVE", regionCode: "ng", units: "METRIC" }),
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    const m = body?.routes?.[0]?.distanceMeters;
    if (typeof m !== "number") return null;
    return Math.round((m / 1000) * 10) / 10; // metres → km, 1 dp
  } catch {
    return null;
  }
}

/**
 * Driving distance in km from one point to many (Routes API
 * computeRouteMatrix, one request; at most 25 destinations). Entries Google
 * can't route come back null; everything is null without a key.
 */
export async function drivingDistancesKm(from: LatLng, tos: LatLng[]): Promise<(number | null)[]> {
  const key = KEY();
  const out: (number | null)[] = tos.map(() => null);
  if (!key || tos.length === 0) return out;
  const wp = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
  try {
    const res = await fetch(`${ROUTES_BASE()}/distanceMatrix/v2:computeRouteMatrix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,condition",
      },
      body: JSON.stringify({ origins: [wp(from)], destinations: tos.slice(0, 25).map(wp), travelMode: "DRIVE", regionCode: "ng", units: "METRIC" }),
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!res.ok) return out;
    const rows = await res.json();
    for (const r of Array.isArray(rows) ? rows : []) {
      const i = Number(r?.destinationIndex ?? -1);
      if (i >= 0 && i < out.length && r?.condition === "ROUTE_EXISTS" && typeof r?.distanceMeters === "number") {
        out[i] = Math.round((r.distanceMeters / 1000) * 10) / 10;
      }
    }
  } catch { /* leave nulls */ }
  return out;
}

/** Straight-line ("as the crow flies") distance in km. */
export function straightKm(a: LatLng, b: LatLng): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** One line for geocoding from address parts. */
export function addressText(parts: { address_line?: string | null; line1?: string | null; area?: string | null; city?: string | null }) {
  return [parts.address_line ?? parts.line1, parts.area, parts.city, "Nigeria"].filter((p) => p && String(p).trim()).join(", ");
}
