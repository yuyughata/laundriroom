import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerShell } from "@/components/shells/CustomerShell";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { TICKET_STATUS_LABEL, ticketChip } from "@/lib/support";
import { ReplyBox } from "./ReplyBox";
import type { SupportTicket, SupportMessage, Order } from "@/lib/database.types";

export default async function CustomerTicket({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: ticket } = await supabase.from("support_tickets").select("*").eq("id", params.id).maybeSingle();
  if (!ticket) notFound();
  const t = ticket as SupportTicket;

  const [{ data: messages }, { data: order }] = await Promise.all([
    supabase.from("support_messages").select("*").eq("ticket_id", t.id).order("created_at"),
    t.order_id ? supabase.from("orders").select("code").eq("id", t.order_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const msgs = (messages ?? []) as SupportMessage[];
  const orderCode = (order as Pick<Order, "code"> | null)?.code;

  return (
    <CustomerShell active="/customer/support">
      <Link href="/customer/support" className="text-sm text-slate">← Support</Link>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="font-display text-xl text-ink">#{t.number} · {t.subject}</h1>
        <span className={ticketChip(t.status)}>{TICKET_STATUS_LABEL[t.status]}</span>
      </div>
      <p className="mt-1 text-xs text-slate">
        {t.category}{t.subcategory ? ` · ${t.subcategory}` : ""}{orderCode ? ` · ${orderCode}` : ""}
      </p>
      {t.other_text && <p className="mt-2 text-sm text-ink">{t.other_text}</p>}

      <div className="mt-6 space-y-3">
        {msgs.map((m) => (
          <div key={m.id} className={`rounded-card p-3 ${m.from_support ? "bg-ink text-ivory" : "bg-white border border-ink/10"}`}>
            <p className={`text-xs ${m.from_support ? "text-ivory/60" : "text-slate"}`}>
              {m.from_support ? "laundriroom Support" : "You"} · {dateTime(m.created_at)}
            </p>
            <p className={`mt-1 text-sm ${m.from_support ? "text-ivory" : "text-ink"}`}>{m.body}</p>
          </div>
        ))}
      </div>

      {t.status !== "closed" ? (
        <ReplyBox ticketId={t.id} />
      ) : (
        <p className="mt-4 text-sm text-slate">This request is closed. Open a new one if you still need help.</p>
      )}
    </CustomerShell>
  );
}
