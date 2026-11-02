import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { buildReportPdf, pdfMoney } from "@/lib/pdf";
import { scopeLabel, genDateLine, stamp, pdfResponse } from "@/lib/reports";
import { STATUS_LABEL, dateShort } from "@/lib/format";
import type { OrderSummary, OrderStatus } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/** Orders report — scoped to the signed-in role by RLS (own / station / all). */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient();
  const { data } = await supabase
    .from("order_summaries").select("*").order("created_at", { ascending: false }).limit(5000);
  const orders = (data ?? []) as OrderSummary[];

  const total = orders.reduce((s, o) => s + Number(o.total), 0);
  const paid = orders.filter((o) => o.is_paid).reduce((s, o) => s + Number(o.total), 0);

  const pdf = await buildReportPdf({
    title: "Orders report",
    meta: [scopeLabel(profile.role), `${orders.length} orders`, genDateLine()],
    columns: [
      { header: "Order", width: 90 },
      { header: "Date", width: 70 },
      { header: "Vendor", width: 110 },
      { header: "Customer", width: 110 },
      { header: "Items", width: 45, align: "right" },
      { header: "Total", width: 80, align: "right" },
      { header: "Paid", width: 55 },
      { header: "Status", width: 90 },
    ],
    rows: orders.map((o) => [
      o.code,
      dateShort(o.created_at),
      o.vendor_name,
      o.customer_name,
      String(o.item_count),
      pdfMoney(o.total),
      o.is_paid ? "Paid" : o.payment_timing === "on_delivery" ? "On delivery" : "Pending",
      STATUS_LABEL[o.status as OrderStatus],
    ]),
    totalsRow: ["Total", "", "", "", String(orders.length), pdfMoney(total), pdfMoney(paid) + " paid", ""],
  });

  return pdfResponse(pdf, `fresco-orders-${stamp()}.pdf`);
}
