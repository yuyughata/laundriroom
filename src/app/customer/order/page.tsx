import { cleanPromoParam } from "@/lib/promoLinks";
import { CustomerShell } from "@/components/shells/CustomerShell";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { isVendorOpenNow, hoursLabel } from "@/lib/hours";
import { OrderForm, type OrderVendor } from "./OrderForm";
import type { Vendor, ServiceExtra, Branch, CustomerAddress } from "@/lib/database.types";
import { loadPricing } from "@/lib/deliveryPricing";
import { mapsConfigured } from "@/lib/maps";

export default async function NewOrderPage({ searchParams }: { searchParams: { vendor?: string; branch?: string; promo?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, slug, name, area, city, delivery, is_open, opens_at, closes_at")
    .eq("status", "verified")
    .order("name");

  const [pricing, { data: extras }, { data: ratings }, { data: branchRows, error: branchErr }, { data: addresses }] = await Promise.all([
    loadPricing(supabase),
    supabase.from("service_extras").select("*").eq("active", true).order("price"),
    supabase.from("vendor_ratings").select("*"),
    supabase.from("branches").select("*").eq("active", true).order("is_main", { ascending: false }).order("name"),
    user
      ? supabase.from("customer_addresses").select("*").eq("customer_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  // Active branches per vendor. On a database without branches (before
  // migration 0033) each vendor is its own single location.
  const branchesByVendor = new Map<string, Branch[]>();
  if (!branchErr) for (const b of (branchRows ?? []) as Branch[]) {
    branchesByVendor.set(b.vendor_id, [...(branchesByVendor.get(b.vendor_id) ?? []), b]);
  }

  const ratingMap = new Map(
    ((ratings ?? []) as { vendor_id: string; avg_rating: number; review_count: number }[])
      .map((r) => [r.vendor_id, r])
  );

  const list: OrderVendor[] = ((vendors ?? []) as Pick<Vendor, "id" | "slug" | "name" | "area" | "city" | "delivery" | "is_open" | "opens_at" | "closes_at">[])
    .map((v) => {
      const bs = branchesByVendor.get(v.id) ?? [];
      const branches = !branchErr
        ? bs.map((b) => ({
            id: b.id, name: b.name, area: b.area, city: b.city, address_line: b.address_line,
            openNow: isVendorOpenNow(b), hours: hoursLabel(b.opens_at, b.closes_at),
          }))
        : [{ id: "", name: v.area ?? v.name, area: v.area, city: v.city, address_line: null,
             openNow: isVendorOpenNow(v), hours: hoursLabel(v.opens_at, v.closes_at) }];
      return {
        id: v.id, slug: v.slug, name: v.name, area: v.area, city: v.city, delivery: v.delivery,
        branches,
        openNow: branches.some((b) => b.openNow),
        hours: hoursLabel(v.opens_at, v.closes_at),
        rating: Number(ratingMap.get(v.id)?.avg_rating ?? 0),
        reviewCount: Number(ratingMap.get(v.id)?.review_count ?? 0),
      };
    })
    // Hide vendors whose every branch is closed down (not just closed for the day).
    .filter((v) => v.branches.length > 0);

  // Came from a vendor's profile link: order from that laundry.
  const wanted = (searchParams?.vendor ?? "").trim().toLowerCase();
  const linked = wanted ? list.find((v) => v.slug === wanted) : undefined;

  return (
    <CustomerShell active="/customer/order">
      <h1 className="font-display text-2xl text-ink">New order</h1>
      {wanted && !linked && (
        <p className="mt-3 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">
          That laundry isn&apos;t taking orders on laundriroom right now. You can choose another one below.
        </p>
      )}
      <p className="mt-1 text-sm text-slate">
        Pick a laundry and how it comes and goes. Staff check in and price each
        item when it arrives. Drop-off and pickup follow the laundry&apos;s hours.
      </p>

      <OrderForm
        vendors={list}
        deliveryFee={pricing.flat}
        deliveryFeeLabel={money(pricing.flat)}
        pricedByDistance={pricing.mode === "distance"}
        nearestEnabled={mapsConfigured() && pricing.mode === "distance"}
        extras={(extras ?? []) as ServiceExtra[]}
        linkedVendorId={linked?.id}
        linkedBranchId={linked && linked.branches.some((b) => b.id === searchParams?.branch) ? searchParams.branch : undefined}
        promoCode={cleanPromoParam(searchParams?.promo) ?? undefined}
        addresses={((addresses ?? []) as CustomerAddress[]).map((a) => ({
          id: a.id, label: a.label, text: [a.line1, a.area, a.city].filter(Boolean).join(", "),
        }))}
      />
    </CustomerShell>
  );
}
