import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { buildReportPdf, pdfMoney } from "@/lib/pdf";
import { scopeLabel, genDateLine, stamp, pdfResponse } from "@/lib/reports";
import { dateShort } from "@/lib/format";
import type { Payout } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * Payout statement — a reconciliation document of a vendor's payouts (RLS scopes
 * it to the signed-in vendor; admins get all). Shows gross, fee, net and status,
 * with sent/outstanding totals.
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });
  if (profile.role === "customer") return new Response("Forbidden", { status: 403 });

  const supabase = createClient();
  const { data } = await supabase
    .from("payouts")
    .select("*, vendors(name)")
    .order("due_at", { ascending: false })
    .limit(2000);
  const rows = (data ?? []) as unknown as (Payout & { vendors: { name: string } | null })[];

  const sent = rows.filter((r) => r.status === "sent");
  const due = rows.filter((r) => ["due", "held"].includes(r.status));
  const sentTotal = sent.reduce((s, r) => s + Number(r.net), 0);
  const dueTotal = due.reduce((s, r) => s + Number(r.net), 0);
  const feeTotal = rows.reduce((s, r) => s + Number(r.fee), 0);
  const vendorName = rows[0]?.vendors?.name;

  const pdf = await buildReportPdf({
    title: "Payout statement",
    meta: [
      scopeLabel(profile.role),
      vendorName ? `Vendor: ${vendorName}` : `${rows.length} payouts`,
      `Paid to date: ${pdfMoney(sentTotal)}  ·  Outstanding: ${pdfMoney(dueTotal)}  ·  Commission: ${pdfMoney(feeTotal)}`,
      genDateLine(),
    ],
    columns: [
      { header: "Due", width: 80 },
      { header: "Vendor", width: 140 },
      { header: "Orders", width: 55, align: "right" },
      { header: "Gross", width: 85, align: "right" },
      { header: "Commission", width: 90, align: "right" },
      { header: "Net", width: 85, align: "right" },
      { header: "Status", width: 65 },
      { header: "Sent", width: 70 },
    ],
    rows: rows.map((r) => [
      dateShort(r.due_at),
      r.vendors?.name ?? "—",
      String(r.order_ids?.length ?? 0),
      pdfMoney(r.gross),
      pdfMoney(r.fee),
      pdfMoney(r.net),
      r.status,
      r.sent_at ? dateShort(r.sent_at) : "—",
    ]),
    totalsRow: ["Totals", "", "", "", pdfMoney(feeTotal), pdfMoney(sentTotal + dueTotal), "", ""],
  });

  return pdfResponse(pdf, `laundriroom-statement-${stamp()}.pdf`);
}
