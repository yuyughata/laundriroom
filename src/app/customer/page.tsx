import Link from "next/link";
import { CustomerShell } from "@/components/shells/CustomerShell";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { money, dateShort, STATUS_LABEL, statusChip } from "@/lib/format";
import type { OrderSummary } from "@/lib/database.types";

export default async function CustomerHome() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: orders } = await supabase
    .from("order_summaries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: appData } = await supabase
    .from("vendor_applications")
    .select("status")
    .eq("applicant_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const application = appData as { status: "pending" | "approved" | "rejected" } | null;

  const list = (orders ?? []) as OrderSummary[];
  const active = list.filter((o) => !["closed", "cancelled"].includes(o.status));
  const past = list.filter((o) => ["closed", "cancelled"].includes(o.status));
  const firstName = profile.full_name.split(" ")[0] || "there";

  return (
    <CustomerShell active="/customer">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate">Hello,</p>
          <h1 className="font-display text-2xl text-ink">{firstName}</h1>
        </div>
      </header>

      {!profile.email_verified && (
        <div className="mt-5 rounded-card border border-warn/30 bg-warn/10 p-4">
          <p className="text-sm font-medium text-warn">Verify your email</p>
          <p className="mt-1 text-xs text-ink/70">
            You can keep ordering, but verify your email so you don&apos;t miss order
            updates. We sent a link to {profile.email}.
          </p>
        </div>
      )}

      {application && (
        <Link href="/apply/status"
          className="mt-5 block rounded-card border border-champagne/40 bg-champagne/10 p-4">
          <p className="text-sm font-medium text-ink">
            Partner application {application.status === "approved"
              ? "approved"
              : application.status === "rejected"
                ? "update"
                : "under review"}
          </p>
          <p className="mt-1 text-xs text-ink/70">
            {application.status === "approved"
              ? "You're approved — tap to open your laundry dashboard."
              : "Tap to check the status of your laundry partner application."}
          </p>
        </Link>
      )}

      <Link href="/customer/order"
        className="mt-6 flex items-center justify-between rounded-card bg-ink p-5 text-ivory">
        <div>
          <p className="font-display text-lg">New order</p>
          <p className="text-sm text-ivory/60">Pickup or drop-off</p>
        </div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Link>

      <section className="mt-8">
        <h2 className="font-display text-lg text-ink">Active orders</h2>
        {active.length === 0 ? (
          <p className="mt-3 text-sm text-slate">No active orders. Start one above.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {active.map((o) => <OrderCard key={o.id} o={o} />)}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg text-ink">History</h2>
          <div className="mt-3 space-y-3">
            {past.slice(0, 8).map((o) => <OrderCard key={o.id} o={o} />)}
          </div>
        </section>
      )}
    </CustomerShell>
  );
}

function OrderCard({ o }: { o: OrderSummary }) {
  return (
    <Link href={`/customer/orders/${o.id}`} className="card block p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-ink">{o.code}</p>
        <span className={statusChip(o.status)}>{STATUS_LABEL[o.status]}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm text-slate">
        <span>{o.vendor_name}</span>
        <span>{o.item_count} item{o.item_count === 1 ? "" : "s"} · {money(o.total)}</span>
      </div>
      <p className="mt-1 text-xs text-slate">{dateShort(o.created_at)}</p>
    </Link>
  );
}
