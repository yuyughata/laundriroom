import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { AddExpense } from "./AddExpense";
import { PayoutAccount } from "./PayoutAccount";
import type { VendorPayoutAccount } from "@/lib/database.types";
import { money, dateShort } from "@/lib/format";
import type { Payout, OrderSummary, LedgerEntry } from "@/lib/database.types";

const lagosDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }) : "—";

export default async function LedgerPage() {
  const ctx = await getVendorContext();
  if (!ctx.isManager) {
    // Money is for the business's main manager only (also enforced in the database).
    return (
      <VendorShell active="/vendor/ledger" vendorName={ctx.vendorName} isManager={false}
        staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
        <h1 className="font-display text-2xl text-ink">Ledger</h1>
        <p className="mt-3 rounded-card bg-ink/5 px-4 py-3 text-sm text-slate">
          Only the business&apos;s main manager can see income, expenses and payouts.
        </p>
      </VendorShell>
    );
  }
  const supabase = createClient();

  const [{ data: payouts }, { data: orders }, { data: entries }, { data: acct }] = await Promise.all([
    supabase.from("payouts").select("*").eq("vendor_id", ctx.vendorId).order("due_at", { ascending: false }),
    supabase.from("order_summaries").select("*").eq("vendor_id", ctx.vendorId).eq("status", "closed").order("closed_at", { ascending: false }).limit(500),
    supabase.from("ledger_entries").select("*").eq("vendor_id", ctx.vendorId).order("created_at", { ascending: false }).limit(500),
    supabase.from("vendor_payout_accounts").select("*").eq("vendor_id", ctx.vendorId).maybeSingle(),
  ]);

  const po = (payouts ?? []) as Payout[];
  const closed = ((orders ?? []) as OrderSummary[]).filter((o) => o.is_paid);
  const ledger = (entries ?? []) as LedgerEntry[];
  const expenses = ledger.filter((e) => e.type === "expense");

  // Daily cash-up: income from paid orders + expenses, by Lagos day.
  // Income = what the business receives per order: its own prices + delivery.
  // (The customer's total also carries laundriroom's commission and markups.)
  const earned = (o: OrderSummary) => Number(o.vendor_earnings ?? o.total);
  const days = new Map<string, { income: number; expense: number }>();
  for (const o of closed) {
    const d = lagosDay(o.closed_at ?? o.created_at);
    const row = days.get(d) ?? { income: 0, expense: 0 };
    row.income += earned(o);
    days.set(d, row);
  }
  for (const e of expenses) {
    const d = lagosDay(e.created_at);
    const row = days.get(d) ?? { income: 0, expense: 0 };
    row.expense += Number(e.amount);
    days.set(d, row);
  }
  const cashup = [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30);

  const takings = closed.reduce((s, o) => s + earned(o), 0);
  // Income by branch, for a business with more than one.
  const byBranch = new Map<string, { name: string; orders: number; income: number }>();
  for (const o of closed) {
    const key = o.branch_id ?? "";
    const row = byBranch.get(key) ?? { name: o.branch_name ?? "Main", orders: 0, income: 0 };
    row.orders += 1; row.income += earned(o);
    byBranch.set(key, row);
  }
  const showBranches = ctx.branches.filter((b) => b.active).length > 1 && !ctx.branchId;
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const dueNet = po.filter((p) => ["due", "held"].includes(p.status)).reduce((s, p) => s + Number(p.net), 0);

  return (
    <VendorShell active="/vendor/ledger" vendorName={ctx.vendorName} isManager={ctx.isManager}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Ledger & bookkeeping</h1>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/statement" download>Statement PDF</a>
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/payouts" download>Payouts PDF</a>
          <a className="btn-ghost px-3 py-2 text-xs" href="/api/reports/transactions" download>Transactions PDF</a>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Income (paid orders)" value={money(takings)} sub={`${closed.length} orders`} />
        <Stat label="Expenses" value={money(totalExpenses)} sub={`${expenses.length} entries`} />
        <Stat label="Net" value={money(takings - totalExpenses)} sub="income − expenses" />
        <Stat label="Payout due" value={money(dueNet)} sub="your prices, in full" />
      </div>

      <section className="mt-8 max-w-md">
        <PayoutAccount
          vendorId={ctx.vendorId}
          account={(acct as VendorPayoutAccount | null) ?? null}
          isManager={ctx.isManager}
        />
      </section>

      {/* Income by branch */}
      {showBranches && (
        <section className="mt-8">
          <h2 className="font-display text-lg text-ink">By branch</h2>
          <p className="mt-1 text-xs text-slate">Completed, paid orders. All branches are paid out to the one business account.</p>
          <div className="mt-3 table-scroll rounded-card border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-ink/5 text-left text-xs text-slate">
                <tr><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">Income</th></tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {[...byBranch.values()].sort((a, b) => b.income - a.income).map((r) => (
                  <tr key={r.name}>
                    <td className="px-4 py-3 text-ink">{r.name}</td>
                    <td className="px-4 py-3 text-slate">{r.orders}</td>
                    <td className="px-4 py-3 font-medium text-ink">{money(r.income)}</td>
                  </tr>
                ))}
                {byBranch.size === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-slate">No completed orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Daily cash-up */}
      <section className="mt-8">
        <h2 className="font-display text-lg text-ink">Daily cash-up</h2>
        <div className="mt-3 table-scroll rounded-card border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs text-slate">
              <tr>
                <th className="px-4 py-2">Day</th><th className="px-4 py-2 text-right">Income</th>
                <th className="px-4 py-2 text-right">Expenses</th><th className="px-4 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {cashup.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate">No activity yet.</td></tr>
              ) : cashup.map(([day, r]) => (
                <tr key={day}>
                  <td className="px-4 py-2 text-slate">{day}</td>
                  <td className="px-4 py-2 text-right">{money(r.income)}</td>
                  <td className="px-4 py-2 text-right text-slate">−{money(r.expense)}</td>
                  <td className="px-4 py-2 text-right font-medium text-ink">{money(r.income - r.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Expenses & receipts */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">Expenses & receipts</h2>
          {ctx.isManager && <AddExpense vendorId={ctx.vendorId} />}
        </div>
        {!ctx.isManager && <p className="mt-1 text-xs text-slate">Only a manager can record expenses.</p>}
        <div className="mt-3 space-y-2">
          {expenses.length === 0 ? (
            <p className="text-sm text-slate">No expenses recorded.</p>
          ) : expenses.map((e) => (
            <div key={e.id} className="card flex items-center justify-between p-3">
              <div>
                <p className="text-sm text-ink">{e.reason ?? "Expense"}</p>
                <p className="text-xs text-slate">
                  {dateShort(e.created_at)}{e.receipt_path ? " · 📎 receipt attached" : ""}
                </p>
              </div>
              <p className="text-sm font-medium text-ink">−{money(e.amount)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Payouts */}
      <section className="mt-8">
        <h2 className="font-display text-lg text-ink">Payouts</h2>
        <p className="mt-1 text-xs text-slate">
          You're paid automatically to your payout account as soon as an order is completed and paid. You receive your own prices and the delivery fee in full — laundriroom's commission is added on top of your prices for the customer. (Older payouts show the commission that used to be deducted as a fee.) A disputed payout is held until it's resolved.
        </p>
        {po.length === 0 ? (
          <p className="mt-3 text-sm text-slate">No payouts yet.</p>
        ) : (
          <div className="mt-3 table-scroll rounded-card border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-ink/5 text-left text-xs text-slate">
                <tr>
                  <th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Gross</th>
                  <th className="px-4 py-2 text-right">Fee</th><th className="px-4 py-2 text-right">Net</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {po.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-slate">{dateShort(p.due_at)}</td>
                    <td className="px-4 py-2 text-right">{money(p.gross)}</td>
                    <td className="px-4 py-2 text-right text-slate">{Number(p.fee) > 0 ? `−${money(p.fee)}` : "—"}</td>
                    <td className="px-4 py-2 text-right font-medium text-ink">{money(p.net)}</td>
                    <td className="px-4 py-2">
                      <span className={p.status === "sent" ? "chip-ok" : p.status === "held" ? "chip-warn" : "chip-muted"}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </VendorShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
      <p className="text-xs text-slate">{sub}</p>
    </div>
  );
}
