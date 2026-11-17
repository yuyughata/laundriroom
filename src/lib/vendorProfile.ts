import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryMode, ServiceType, VendorStatus } from "@/lib/database.types";

/** A vendor's public profile, as returned by get_vendor_profile (migration 0031). */
export type VendorProfile = {
  id: string;
  slug: string;
  name: string;
  status: VendorStatus;
  kyc_verified: boolean;
  address_line: string | null;
  area: string | null;
  city: string | null;
  delivery: DeliveryMode;
  service_radius_km: number;
  opens_at: string | null;
  closes_at: string | null;
  is_open: boolean;
  member_since: string;
  completed_orders: number;
  /** Active branches, main first (migration 0033; absent on older databases). */
  branches?: {
    id: string; name: string; is_main: boolean; address_line: string | null; area: string | null;
    city: string | null; phone: string | null; opens_at: string | null; closes_at: string | null; is_open: boolean;
  }[];
  rating: { avg: number; count: number; dist: Record<"1" | "2" | "3" | "4" | "5", number> };
  reviews: { rating: number; comment: string | null; created_at: string; reviewer: string }[];
  prices: { item: string; service: ServiceType; price: number }[];
};

/** Read a vendor's public profile by its link name. Works signed out. Cached per request. */
export const getVendorProfile = cache(async (slug: string): Promise<VendorProfile | null> => {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_vendor_profile" as never, { p_slug: slug } as never);
  return (data as VendorProfile | null) ?? null;
});

/**
 * The app's public base URL, for the links and QR codes shared from the app.
 * Prefers NEXT_PUBLIC_SITE_URL when it's a real https URL; otherwise falls back
 * to the domain the request actually arrived on (so QRs/links match the live
 * site even if the build-time env var was missing), then localhost in dev.
 */
export function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env && /^https:\/\//i.test(env)) return env.replace(/\/$/, "");
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host && !/^(localhost|127\.|\[::1\])/i.test(host)) return `${proto}://${host}`.replace(/\/$/, "");
  } catch { /* not in a request scope (e.g. build) — fall through */ }
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/$/, "");
  // Never emit a localhost link in production.
  return process.env.NODE_ENV === "production" ? "https://www.laundriroom.ng" : "http://localhost:3000";
}

/** The shareable profile link for a vendor. */
export function vendorProfileUrl(slug: string): string {
  return `${siteUrl()}/v/${slug}`;
}

/** Where the profile's Order button goes: the order form with this vendor chosen. */
export function vendorOrderPath(slug: string, branchId?: string): string {
  return `/customer/order?vendor=${encodeURIComponent(slug)}${branchId ? `&branch=${encodeURIComponent(branchId)}` : ""}`;
}
