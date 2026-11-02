import Link from "next/link";
import { CustomerShell } from "@/components/shells/CustomerShell";
import { createClient } from "@/lib/supabase/server";
import { TicketForm } from "./TicketForm";

export default async function NewTicketPage() {
  const supabase = createClient();
  const { data: orders } = await supabase
    .from("orders").select("id, code").order("created_at", { ascending: false }).limit(20);

  return (
    <CustomerShell active="/customer/support">
      <Link href="/customer/support" className="text-sm text-slate">← Support</Link>
      <h1 className="mt-3 font-display text-2xl text-ink">New support request</h1>
      <p className="mt-1 text-sm text-slate">
        Pick the closest category, or choose “Other” to describe anything not listed.
      </p>
      <TicketForm orders={(orders ?? []) as { id: string; code: string }[]} />
    </CustomerShell>
  );
}
