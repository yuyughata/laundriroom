import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { TICKET_STATUS_LABEL, ticketChip } from "@/lib/support";
import { TicketControls, SupportReplyBox } from "./TicketControls";
import type { SupportTicket, SupportMessage, Order, Profile } from "@/lib/database.types";

export default async function AdminTicket({ params }: { params: { id: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: ticket } = await supabase.from("support_tickets").select("*").eq("id", params.id).maybeSingle();
  if (!ticket) notFound();
  const t = ticket as SupportTicket;

  const [{ data: messages }, { data: customer }, { data: order }] = await Promise.all([
    supabase.from("support_messages").select("*").eq("ticket_id", t.id).order("created_at"),
    supabase.from("profiles").select("full_name, email, phone").eq("id", t.customer_id).maybeSingle(),
    t.order_id ? supabase.from("orders").select("code").eq("id", t.order_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const msgs = (messages ?? []) as SupportMessage[];
  const cust = customer as Pick<Profile, "full_name" | "email" | "phone"> | null;
  const orderCode = (order as Pick<Order, "code"> | null)?.code;

  return (
    <AdminShell active="/admin/support" name={profile.full_name} role={profile.role}>
      <Link href="/admin/support" className="text-sm text-slate">← Support</Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-xl text-ink">#{t.number} · {t.subject}</h1>
            <span className={ticketChip(t.status)}>{TICKET_STATUS_LABEL[t.status]}</span>
          </div>
          <p className="mt-1 text-xs text-slate">
            {t.category}{t.subcategory ? ` · ${t.subcategory}` : ""}{orderCode ? ` · ${orderCode}` : ""} · opened {dateTime(t.created_at)}
          </p>
          {t.other_text && <p className="mt-2 text-sm text-ink">{t.other_text}</p>}

          <div className="mt-6 space-y-3">
            {msgs.map((m) => (
              <div key={m.id} className={`rounded-card p-3 ${m.from_support ? "bg-ink text-ivory" : "bg-white border border-ink/10"}`}>
                <p className={`text-xs ${m.from_support ? "text-ivory/60" : "text-slate"}`}>
                  {m.from_support ? "Support" : cust?.full_name ?? "Customer"} · {dateTime(m.created_at)}
                </p>
                <p className={`mt-1 text-sm ${m.from_support ? "text-ivory" : "text-ink"}`}>{m.body}</p>
              </div>
            ))}
          </div>

          <SupportReplyBox ticketId={t.id} />
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <p className="label">Customer</p>
            <p className="text-sm font-medium text-ink">{cust?.full_name ?? "—"}</p>
            <p className="text-xs text-slate">{cust?.email ?? ""}</p>
            <p className="text-xs text-slate">{cust?.phone ?? ""}</p>
          </div>
          <TicketControls ticketId={t.id} status={t.status} />
        </div>
      </div>
    </AdminShell>
  );
}
