import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerShell } from "@/components/shells/CustomerShell";
import { createClient } from "@/lib/supabase/server";
import { PayNowButton } from "@/components/ui/PayNowButton";
import { money } from "@/lib/format";
import type { Order, Payment } from "@/lib/database.types";

/** Dedicated checkout — the target of the "Pay now" link in the delivery email. */
export default async function PayPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", params.id).maybeSingle();
  if (!order) notFound();
  const o = order as Order;

  const { data: payments } = await supabase.from("payments").select("*").eq("order_id", o.id);
  const isPaid = (payments as Payment[] | null)?.some((p) => p.status === "succeeded");

  return (
    <CustomerShell>
      <Link href={`/customer/orders/${o.id}`} className="text-sm text-slate">← Back to order</Link>
      <h1 className="mt-3 font-display text-2xl text-ink">Checkout</h1>
      <p className="mt-1 text-sm text-slate">{o.code}</p>

      <div className="card mt-6 p-6 text-center">
        <p className="text-sm text-slate">Amount due</p>
        <p className="mt-1 font-display text-4xl text-ink">{money(o.total)}</p>
      </div>

      <div className="mt-6">
        {isPaid ? (
          <div className="rounded-card border border-teal/30 bg-teal/10 p-4 text-center text-sm text-teal">
            This order is already paid.
          </div>
        ) : (
          <PayNowButton orderId={o.id} label={`Pay ${money(o.total)}`} />
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate">
        Secured by Paystack. Paying closes the order.
      </p>
    </CustomerShell>
  );
}
