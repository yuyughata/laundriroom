import Link from "next/link";
import { CustomerShell } from "@/components/shells/CustomerShell";
import { createClient } from "@/lib/supabase/server";
import { dateShort } from "@/lib/format";
import { TICKET_STATUS_LABEL, ticketChip } from "@/lib/support";
import type { SupportTicket } from "@/lib/database.types";

export default async function SupportHome() {
  const supabase = createClient();
  const { data } = await supabase
    .from("support_tickets").select("*").order("updated_at", { ascending: false });
  const tickets = (data ?? []) as SupportTicket[];

  return (
    <CustomerShell active="/customer/support">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Support</h1>
        <Link href="/customer/support/new" className="btn-accent px-4 py-2 text-sm">New request</Link>
      </div>
      <p className="mt-1 text-sm text-slate">Report a problem or ask for help. We&apos;ll reply here.</p>

      <div className="mt-6 space-y-3">
        {tickets.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-slate">No requests yet.</p>
            <Link href="/customer/support/new" className="btn-primary mt-4 inline-flex">Get support</Link>
          </div>
        ) : tickets.map((t) => (
          <Link key={t.id} href={`/customer/support/${t.id}`} className="card block p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-ink">#{t.number} · {t.subject}</p>
              <span className={ticketChip(t.status)}>{TICKET_STATUS_LABEL[t.status]}</span>
            </div>
            <p className="mt-1 text-xs text-slate">
              {t.category}{t.subcategory ? ` · ${t.subcategory}` : ""} · {dateShort(t.updated_at)}
            </p>
          </Link>
        ))}
      </div>
    </CustomerShell>
  );
}
