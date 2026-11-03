import { CustomerShell } from "@/components/shells/CustomerShell";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { isVendorOpenNow, hoursLabel } from "@/lib/hours";
import { OrderForm, type OrderVendor } from "./OrderForm";
import type { Vendor, ServiceExtra } from "@/lib/database.types";

export default async function NewOrderPage({ searchParams }: { searchParams: { vendor?: string } }) {
  const supabase = createClient();

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, slug, name, area, city, delivery, is_open, opens_at, closes_at")
    .eq("status", "verified")
    .order("name");

  const [{ data: rule }, { data: extras }, { data: ratings }] = await Promise.all([
    supabase.from("delivery_fee_rules").select("flat_amount").eq("scope", "global").eq("active", true).limit(1).maybeSingle(),
    supabase.from("service_extras").select("*").eq("active", true).order("price"),
    supabase.from("vendor_ratings").select("*"),
  ]);

  const ratingMap = new Map(
    ((ratings ?? []) as { vendor_id: string; avg_rating: number; review_count: number }[])
      .map((r) => [r.vendor_id, r])
  );

  const list: OrderVendor[] = ((vendors ?? []) as Pick<Vendor, "id" | "slug" | "name" | "area" | "city" | "delivery" | "is_open" | "opens_at" | "closes_at">[])
    .map((v) => ({
      id: v.id, slug: v.slug, name: v.name, area: v.area, city: v.city, delivery: v.delivery,
      openNow: isVendorOpenNow(v),
      hours: hoursLabel(v.opens_at, v.closes_at),
      rating: Number(ratingMap.get(v.id)?.avg_rating ?? 0),
      reviewCount: Number(ratingMap.get(v.id)?.review_count ?? 0),
    }));

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
        deliveryFee={Number(rule?.flat_amount ?? 0)}
        deliveryFeeLabel={money(Number(rule?.flat_amount ?? 0))}
        extras={(extras ?? []) as ServiceExtra[]}
        linkedVendorId={linked?.id}
      />
    </CustomerShell>
  );
}
