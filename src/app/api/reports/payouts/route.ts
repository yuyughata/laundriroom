import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeVendorFinances } from "@/lib/auth";
import { buildReportPdf, pdfMoney } from "@/lib/pdf";
import { scopeLabel, genDateLine, stamp, pdfResponse } from "@/lib/reports";
import { dateShort } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  id: string; gross: number; fee: number; net: number; status: string;
  due_at: string; sent_at: string | null; vendors: { name: string } | null;
};

/** Payouts report — vendor staff see their station, admin sees all. Customers forbidden. */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });
  // Vendor money is for the business's manager only (attendants, riders and
  // branch managers can't download it).
  if (["attendant", "rider", "vendor_manager"].includes(profile.role) && !(await canSeeVendorFinances(profile))) {
    return new Response("Only the business's manager can see this report.", { status: 403 });
  }
  if (profile.role === "customer") return new Response("Forbidden", { status: 403 });

  const supabase = createClient();
  const { data } = await supabase
    .from("payouts")
    .select("id, gross, fee, net, status, due_at, sent_at, vendors(name)")
    .order("due_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []) as unknown as Row[];

  const net = rows.reduce((s, r) => s + Number(r.net), 0);
  const due = rows.filter((r) => ["due", "held"].includes(r.status)).reduce((s, r) => s + Number(r.net), 0);

  const pdf = await buildReportPdf({
    title: "Payouts report",
    meta: [scopeLabel(profile.role), `${rows.length} payouts`, genDateLine()],
    columns: [
      { header: "Due", width: 80 },
      { header: "Vendor", width: 150 },
      { header: "Gross", width: 90, align: "right" },
      { header: "Fee", width: 80, align: "right" },
      { header: "Net", width: 90, align: "right" },
      { header: "Status", width: 70 },
      { header: "Sent", width: 80 },
    ],
    rows: rows.map((r) => [
      dateShort(r.due_at),
      r.vendors?.name ?? "—",
      pdfMoney(r.gross),
      pdfMoney(r.fee),
      pdfMoney(r.net),
      r.status,
      r.sent_at ? dateShort(r.sent_at) : "—",
    ]),
    totalsRow: ["Total", "", "", "", pdfMoney(net), `${pdfMoney(due)} outstanding`, ""],
  });

  return pdfResponse(pdf, `fresco-payouts-${stamp()}.pdf`);
}
