import Link from "next/link";
import { notFound } from "next/navigation";
import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { OrderWorkspace } from "./OrderWorkspace";
import { OrderActivity, type ActivityRow } from "@/components/orders/OrderActivity";
import type { Order, OrderItem, ItemType, PriceListRow, Payment, OrderExtra } from "@/lib/database.types";

export default async function VendorOrderDetail({ params }: { params: { id: string } }) {
  const ctx = await getVendorContext();
  const supabase = createClient();

  const { data: order } = await supabase.from("orders").select("*").eq("id", params.id).maybeSingle();
  if (!order || (order as Order).vendor_id !== ctx.vendorId) notFound();
  const o = order as Order;

  const [{ data: items }, { data: itemTypes }, { data: prices }, { data: payments }, { data: customer }, { data: extras }, { data: activity }] =
    await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", o.id).order("sub_code"),
      supabase.from("item_types").select("*").or(`is_global.eq.true,vendor_id.eq.${ctx.vendorId}`).eq("active", true).order("name"),
      supabase.from("price_list").select("*").eq("vendor_id", ctx.vendorId).eq("active", true),
      supabase.from("payments").select("*").eq("order_id", o.id),
      supabase.from("profiles").select("full_name, phone").eq("id", o.customer_id).maybeSingle(),
      supabase.from("order_extras").select("*").eq("order_id", o.id).order("created_at"),
      // Who did each step (0039); empty if the function isn't there yet.
      supabase.rpc("get_order_activity" as never, { p_order: o.id } as never),
    ]);
  const rows = (Array.isArray(activity) ? activity : []) as ActivityRow[];
  // Item sub-code → the staff member who checked it in.
  const checkedInBy: Record<string, string> = {};
  for (const r of rows) if (r.kind === "item" && r.staff_name) checkedInBy[r.label.split(" · ")[0]] = r.staff_name;

  return (
    <VendorShell active="/vendor/queue" vendorName={ctx.vendorName}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <Link href="/vendor/queue" className="text-sm text-slate">← Queue</Link>
      <OrderWorkspace
        order={o}
        items={(items ?? []) as OrderItem[]}
        itemTypes={(itemTypes ?? []) as ItemType[]}
        prices={(prices ?? []) as PriceListRow[]}
        paid={((payments ?? []) as Payment[]).some((p) => p.status === "succeeded")}
        customerName={(customer as { full_name: string } | null)?.full_name ?? "Customer"}
        extras={(extras ?? []) as OrderExtra[]}
        branchName={ctx.branches.length > 1 || !ctx.branchId
          ? ctx.branches.find((b) => b.id === o.branch_id)?.name ?? null : null}
        checkedInBy={checkedInBy}
      />
      <OrderActivity rows={rows} />
    </VendorShell>
  );
}
