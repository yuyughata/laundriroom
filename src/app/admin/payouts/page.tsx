import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PayoutActions } from "./PayoutActions";
import { money, dateTime } from "@/lib/format";
import type { Payout, Vendor } from "@/lib/database.types";

export default async function AdminPayouts() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: payouts }, { data: vendors }, { data: accounts }, { data: settings }] = await Promise.all([
    supabase.from("payouts").select("*").order("due_at", { ascending: true }),
    supabase.from("vendors").select("id, name"),
    supabase.from("vendor_payout_accounts").select("vendor_id"),
    supabase.from("platform_settings").select("payout_delay_hours").eq("id", true).maybeSingle(),
  ]);
  const delay = Number((settings as { payout_delay_hours?: number } | null)?.payout_delay_hours ?? 0);

  const po = (payouts ?? []) as Payout[];
  const vmap = new Map((vendors as Pick<Vendor, "id" | "name">[] ?? []).map((v) => [v.id, v.name]));
  const hasAccount = new Set(((accounts ?? []) as { vendor_id: string }[]).map((a) => a.vendor_id));
  const due = po.filter((p) => p.status === "due");
  const totalDue = due.reduce((s, p) => s + Number(p.net), 0);

  return (
    <AdminShell active="/admin/payouts" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Payouts</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="chip-warn">{money(totalDue)} due across {due.length}</span>
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/statement" download>Statement PDF</a>
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/payouts" download>Payouts PDF</a>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate">
        {delay === 0
          ? "Vendors are paid automatically through Paystack as soon as an order is completed and paid, net of commission."
          : `Payouts are held for ${delay} hour${delay === 1 ? "" : "s"} after an order is completed and paid, then sent automatically through Paystack, net of commission.`}{" "}
        Anything that can&apos;t be sent is retried every hour. <strong className="text-ink">Hold</strong> a disputed payout;{" "}
        <strong className="text-ink">Release</strong> sends a due or held payout immediately.
      </p>

      <div className="mt-6 table-scroll rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Gross</th><th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Net</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {po.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-ink">
                  <a href={`/admin/payouts/${p.id}`} className="underline decoration-ink/20 hover:decoration-ink">
                    {vmap.get(p.vendor_id) ?? "—"}
                  </a>
                </td>
                <td className="px-4 py-3 text-slate">{dateTime(p.due_at)}</td>
                <td className="px-4 py-3">{money(p.gross)}</td>
                <td className="px-4 py-3 text-slate">−{money(p.fee)}</td>
                <td className="px-4 py-3 font-medium text-ink">{money(p.net)}</td>
                <td className="px-4 py-3">
                  <span className={p.status === "sent" ? "chip-ok" : p.status === "processing" ? "chip-ink" : p.status === "held" ? "chip-warn" : "chip-muted"}>{p.status}</span>
                  {p.failure_reason && <p className="mt-1 text-xs text-danger">{p.failure_reason}</p>}
                  {p.status === "due" && !hasAccount.has(p.vendor_id) && (
                    <p className="mt-1 text-xs text-warn">No payout account — can&apos;t auto-pay</p>
                  )}
                </td>
                <td className="px-4 py-3"><PayoutActions id={p.id} status={p.status} amount={money(p.net)} vendor={vmap.get(p.vendor_id) ?? "this vendor"} /></td>
              </tr>
            ))}
            {po.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate">No payouts scheduled yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
