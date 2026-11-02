import Link from "next/link";
import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { NewOrderForm } from "./NewOrderForm";
import type { ServiceExtra } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/** Vendor staff enter an order for a walk-in or phone customer. */
export default async function VendorNewOrder() {
  const ctx = await getVendorContext();
  const supabase = createClient();

  const [{ data: vendor }, { data: extras }, { data: fee }] = await Promise.all([
    supabase.from("vendors").select("delivery").eq("id", ctx.vendorId).maybeSingle(),
    supabase.from("service_extras").select("*").eq("active", true).order("name"),
    supabase.from("delivery_fee_rules").select("flat_amount").eq("scope", "global").eq("active", true).limit(1).maybeSingle(),
  ]);

  return (
    <VendorShell active="/vendor/queue" vendorName={ctx.vendorName}
      staffName={ctx.profile.full_name} staffRole={ctx.isManager ? "Manager" : "Attendant"}>
      <Link href="/vendor/queue" className="text-sm text-slate">← Queue</Link>
      <h1 className="mt-2 font-display text-2xl text-ink">New order</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        For a walk-in or phone customer. Find them by phone or email, or add them. After creating the order you&apos;ll
        check the items in on the next screen. The customer gets an order confirmation by email and WhatsApp.
      </p>
      <NewOrderForm
        vendorDelivery={(vendor as { delivery?: string } | null)?.delivery ?? "own_riders"}
        extras={(extras ?? []) as ServiceExtra[]}
        deliveryFee={Number((fee as { flat_amount?: number } | null)?.flat_amount ?? 0)} />
    </VendorShell>
  );
}
