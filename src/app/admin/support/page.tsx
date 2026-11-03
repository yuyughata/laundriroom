import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { TICKET_STATUS_LABEL, ticketChip } from "@/lib/support";
import type { SupportTicket, TicketStatus } from "@/lib/database.types";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

type Row = SupportTicket & { profiles: { full_name: string; email: string | null } | null };

export default async function AdminSupport({ searchParams }: { searchParams: { status?: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();
  const filter = searchParams.status ?? "all";

  let query = supabase
    .from("support_tickets")
    .select("*, profiles:customer_id(full_name, email)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (filter !== "all") query = query.eq("status", filter as TicketStatus);

  const { data } = await query;
  const tickets = (data ?? []) as unknown as Row[];
  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <AdminShell active="/admin/support" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Support</h1>
        <span className="chip-warn">{openCount} open</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === "all" ? "/admin/support" : `/admin/support?status=${f.key}`}
            className={`rounded-pill px-3 py-1.5 text-xs ${
              filter === f.key ? "bg-ink text-ivory" : "bg-white text-ink border border-ink/15 hover:bg-ink/5"}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 table-scroll rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {tickets.map((t) => (
              <tr key={t.id} className="cursor-pointer hover:bg-ink/5">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/admin/support/${t.id}`} className="block">#{t.number}</Link>
                </td>
                <td className="px-4 py-3"><Link href={`/admin/support/${t.id}`} className="block text-ink">{t.subject}</Link></td>
                <td className="px-4 py-3 text-slate">{t.profiles?.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-slate">{t.category}{t.subcategory ? ` · ${t.subcategory}` : ""}</td>
                <td className="px-4 py-3"><span className={ticketChip(t.status)}>{TICKET_STATUS_LABEL[t.status]}</span></td>
                <td className="px-4 py-3 text-slate">{dateTime(t.updated_at)}</td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate">No tickets.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
