import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { buildReportPdf, pdfMoney } from "@/lib/pdf";
import { scopeLabel, genDateLine, stamp, pdfResponse } from "@/lib/reports";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  id: string; amount: number; method: string; status: string; reference: string | null;
  paid_at: string | null; created_at: string; orders: { code: string } | null;
};

/** Transaction history — payments scoped to the role by RLS. */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient();
  const { data } = await supabase
    .from("payments")
    .select("id, amount, method, status, reference, paid_at, created_at, orders(code)")
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []) as unknown as Row[];

  const succeeded = rows.filter((r) => r.status === "succeeded").reduce((s, r) => s + Number(r.amount), 0);

  const pdf = await buildReportPdf({
    title: "Transaction history",
    meta: [scopeLabel(profile.role), `${rows.length} transactions`, genDateLine()],
    columns: [
      { header: "Date", width: 95 },
      { header: "Order", width: 100 },
      { header: "Reference", width: 130 },
      { header: "Method", width: 80 },
      { header: "Amount", width: 90, align: "right" },
      { header: "Status", width: 80 },
    ],
    rows: rows.map((r) => [
      dateTime(r.paid_at ?? r.created_at),
      r.orders?.code ?? "—",
      r.reference ?? "—",
      r.method,
      pdfMoney(r.amount),
      r.status,
    ]),
    totalsRow: ["Succeeded total", "", "", "", pdfMoney(succeeded), ""],
  });

  return pdfResponse(pdf, `fresco-transactions-${stamp()}.pdf`);
}
