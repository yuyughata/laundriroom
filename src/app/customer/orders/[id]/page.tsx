import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerShell } from "@/components/shells/CustomerShell";
import { createClient } from "@/lib/supabase/server";
import { PayNowButton } from "@/components/ui/PayNowButton";
import {
  money, dateTime, SERVICE_LABEL, STATUS_LABEL, statusChip, STAGE_LABEL, TIER_LABEL,
} from "@/lib/format";
import { itemCustomerPrice } from "@/lib/pricing";
import { Stars } from "@/components/ui/Stars";
import { PromoInput } from "@/components/ui/PromoInput";
import { ReviewCard } from "./ReviewCard";
import { ClaimCard } from "./ClaimCard";
import type { Order, OrderItem, StageEvent, Payment, Vendor, OrderExtra, Review, Claim } from "@/lib/database.types";

const TIMELINE: { key: string; label: string }[] = [
  { key: "checked_in", label: "Checked in" },
  { key: "processing", label: "In progress" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "closed", label: "Completed" },
];
const ORDER_RANK: Record<string, number> = {
  awaiting_dropoff: 0, pickup_requested: 0, checked_in: 1, processing: 2,
  ready: 3, out_for_delivery: 4, awaiting_collection: 4, closed: 5, cancelled: 5,
};

export default async function TrackOrder({
  params, searchParams,
}: { params: { id: string }; searchParams: { paid?: string; promo_applied?: string; promo_error?: string } }) {
  const supabase = createClient();

  const { data: order } = await supabase.from("orders").select("*").eq("id", params.id).maybeSingle();
  if (!order) notFound();
  const o = order as Order;

  const [{ data: items }, { data: stages }, { data: payments }, { data: vendor }, { data: extras }, { data: review }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", o.id).order("sub_code"),
    supabase.from("stage_events").select("*").eq("order_id", o.id).order("created_at"),
    supabase.from("payments").select("*").eq("order_id", o.id),
    supabase.from("vendors").select("name, area, city").eq("id", o.vendor_id).maybeSingle(),
    supabase.from("order_extras").select("*").eq("order_id", o.id).order("created_at"),
    supabase.from("reviews").select("*").eq("order_id", o.id).maybeSingle(),
  ]);
  const { data: claims } = await supabase.from("claims").select("*").eq("order_id", o.id).order("created_at");

  const its = (items ?? []) as OrderItem[];
  const sts = (stages ?? []) as StageEvent[];
  const pays = (payments ?? []) as Payment[];
  const exs = (extras ?? []) as OrderExtra[];
  const rev = review as Review | null;
  const cls = (claims ?? []) as Claim[];
  const v = vendor as Pick<Vendor, "name" | "area" | "city"> | null;

  const isPaid = pays.some((p) => p.status === "succeeded");
  const rank = ORDER_RANK[o.status] ?? 0;
  const amountDue = !isPaid && o.total > 0;
  // Pay now shows once there's a priced total and the order isn't paid/cancelled.
  const canPay = amountDue && o.status !== "cancelled" &&
    (o.payment_timing === "on_delivery" ? rank >= 3 : rank >= 1);

  return (
    <CustomerShell>
      <Link href="/customer" className="text-sm text-slate">← Orders</Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">{o.code}</h1>
        <span className={statusChip(o.status)}>{STATUS_LABEL[o.status]}</span>
      </div>
      <p className="mt-1 text-sm text-slate">
        {v?.name}{v?.area ? ` · ${v.area}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className={o.service_tier === "premium" ? "chip-ink" : "chip-muted"}>{TIER_LABEL[o.service_tier]}</span>
        {o.turnaround === "express" && <span className="chip-warn">Express</span>}
      </div>

      {searchParams.promo_applied && (
        <div className="mt-4 rounded-card border border-teal/30 bg-teal/10 p-4 text-sm text-teal">
          Promo code {String(searchParams.promo_applied).slice(0, 40)} is applied — the discount shows once your items are priced.
        </div>
      )}
      {searchParams.promo_error && (
        <div className="mt-4 rounded-card border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          Your order is placed, but the promo code couldn&apos;t be used ({String(searchParams.promo_error).slice(0, 160)}). You can try another code below.
        </div>
      )}
      {searchParams.paid && (
        <div className="mt-4 rounded-card border border-teal/30 bg-teal/10 p-4 text-sm text-teal">
          Payment received. Your order is settled.
        </div>
      )}

      {o.status === "closed" && (
        <div className="mt-4">
          {rev ? (
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">Your review</p>
                <Stars value={rev.rating} size={18} />
              </div>
              {rev.comment && <p className="mt-2 text-sm text-slate">“{rev.comment}”</p>}
            </div>
          ) : (
            <ReviewCard orderId={o.id} vendorId={o.vendor_id} />
          )}
          <div className="mt-4"><ClaimCard orderId={o.id} items={its} claims={cls} /></div>
        </div>
      )}

      {/* timeline */}
      <ol className="mt-6 space-y-0">
        {TIMELINE.map((t, i) => {
          const done = rank > i || (rank === i);
          const current = rank === i + 1 || (o.status === t.key);
          const reached = ORDER_RANK[t.key] <= rank;
          return (
            <li key={t.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px]
                  ${reached ? "bg-ink text-ivory" : "bg-ink/10 text-slate"}`}>
                  {reached ? "✓" : i + 1}
                </span>
                {i < TIMELINE.length - 1 && <span className={`w-px flex-1 ${reached ? "bg-ink/30" : "bg-ink/10"}`} />}
              </div>
              <div className="pb-6">
                <p className={`text-sm ${reached ? "font-medium text-ink" : "text-slate"}`}>{t.label}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* pay now */}
      {canPay && (
        <div className="card mb-6 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">
                {o.payment_timing === "on_delivery" ? "Pay on delivery" : "Amount due"}
              </p>
              <p className="text-xs text-slate">
                {o.payment_timing === "on_delivery"
                  ? "Pay when the rider arrives, then give them your delivery code below."
                  : "Pay securely to confirm your order."}
              </p>
            </div>
            <p className="font-display text-xl text-ink">{money(o.total)}</p>
          </div>
          <div className="mt-4">
            <PayNowButton orderId={o.id} label={`Pay now ${money(o.total)}`} />
          </div>
        </div>
      )}

      {/* Pickup PIN — show to the rider when they collect */}
      {o.entry_mode === "pickup" && !o.picked_up_at && o.pickup_code && (
        <div className="card mb-6 p-5 text-center">
          <p className="text-sm text-slate">Pickup PIN — show this to the rider</p>
          <p className="mt-1 font-display text-3xl tracking-[0.3em] text-ink">{o.pickup_code}</p>
        </div>
      )}

      {/* Delivery code — stays here until payment has gone through and the
          laundry has confirmed the code (the order then closes). */}
      {["ready", "out_for_delivery", "awaiting_collection"].includes(o.status) && o.handover_code && (
        <div className="card mb-6 p-5 text-center">
          <p className="text-sm text-slate">
            Delivery code — give this {o.return_mode === "delivery" ? "to the rider" : "at the counter"} when you receive your laundry
          </p>
          <p className="mt-1 font-display text-3xl tracking-[0.3em] text-ink">{o.handover_code}</p>
          <p className={`mt-2 text-xs ${isPaid ? "text-slate" : "text-warn"}`}>
            {isPaid
              ? "Paid. The order closes once the laundry confirms this code."
              : "Pay first: the laundry can only accept this code once your payment has gone through."}
          </p>
        </div>
      )}

      {/* items */}
      <section>
        <h2 className="font-display text-lg text-ink">Items</h2>
        {its.length === 0 ? (
          <p className="mt-2 text-sm text-slate">
            Items appear here once staff check in your laundry.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {its.map((it) => (
              <div key={it.id} className="card p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{it.sub_code}</p>
                  <p className="text-sm text-ink">{money(itemCustomerPrice(it))}</p>
                </div>
                <p className="text-xs text-slate">
                  {SERVICE_LABEL[it.service]}{it.tag_code ? ` · tag ${it.tag_code}` : ""}
                </p>
                {it.customer_comment && <p className="mt-1 text-xs text-slate">“{it.customer_comment}”</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* extras */}
      {exs.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-lg text-ink">Premium extras</h2>
          <div className="mt-3 space-y-2">
            {exs.map((e) => (
              <div key={e.id} className="card flex items-center justify-between p-3">
                <p className="text-sm text-ink">{e.name}</p>
                <p className="text-sm text-ink">{money(e.price)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* promo */}
      {!isPaid && !o.promo_code && o.status !== "cancelled" && (
        <div className="mb-6"><PromoInput orderId={o.id} /></div>
      )}

      {/* totals */}
      <section className="card mt-6 p-4">
        <Row label="Items" value={money(o.items_total)} />
        {o.extras_total > 0 && <Row label="Premium extras" value={money(o.extras_total)} />}
        {o.premium_fee > 0 && <Row label="Premium service" value={money(o.premium_fee)} />}
        {o.express_fee > 0 && <Row label="Express" value={money(o.express_fee)} />}
        <Row label="Delivery" value={o.delivery_fee > 0 ? money(o.delivery_fee) : "Free"} />
        {o.reschedule_penalty > 0 && <Row label="Re-delivery penalty" value={money(o.reschedule_penalty)} />}
        {o.discount > 0 && <Row label={`Promo ${o.promo_code ?? ""}`} value={`−${money(o.discount)}`} />}
        <div className="my-2 border-t border-ink/10" />
        <Row label="Total" value={money(o.total)} strong />
        <Row label="Payment" value={isPaid ? "Paid" : o.payment_timing === "on_delivery" ? "On delivery" : "Online"} />
      </section>

      {sts.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-lg text-ink">Activity</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate">
            {sts.map((s) => (
              <li key={s.id}>{STAGE_LABEL[s.stage]} · {dateTime(s.created_at)}</li>
            ))}
          </ul>
        </section>
      )}
    </CustomerShell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${strong ? "font-medium text-ink" : "text-slate"}`}>{label}</span>
      <span className={`text-sm ${strong ? "font-display text-lg text-ink" : "text-ink"}`}>{value}</span>
    </div>
  );
}
