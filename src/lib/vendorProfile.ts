import { cache } from "react";
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

/** The app's public base URL, for links vendors share. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** The shareable profile link for a vendor. */
export function vendorProfileUrl(slug: string): string {
  return `${siteUrl()}/v/${slug}`;
}

/** Where the profile's Order button goes: the order form with this vendor chosen. */
export function vendorOrderPath(slug: string): string {
  return `/customer/order?vendor=${encodeURIComponent(slug)}`;
}
