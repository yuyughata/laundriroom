import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OrderContactCard, type OrderContact } from "@/components/orders/OrderContactCard";
import {
  money, dateTime, STATUS_LABEL, statusChip, SERVICE_LABEL, TIER_LABEL, TURNAROUND_LABEL, STAGE_LABEL,
} from "@/lib/format";
import type { Order, OrderItem, OrderExtra, Payment, StageEvent, ItemType, OrderStatus } from "@/lib/database.types";

const OPEN: OrderStatus[] = ["awaiting_dropoff", "pickup_requested", "checked_in", "processing", "ready", "out_for_delivery", "awaiting_collection"];

export default async function AdminOrderDetail({ params }: { params: { id: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", params.id).maybeSingle();
  if (!orderRow) notFound();
  const o = orderRow as Order;

  const [{ data: items }, { data: extras }, { data: payments }, { data: stages }, { data: vendor }, { data: branch }, { data: contactRows }] =
    await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", o.id).order("sub_code"),
      supabase.from("order_extras").select("*").eq("order_id", o.id).order("created_at"),
      supabase.from("payments").select("*").eq("order_id", o.id).order("created_at"),
      supabase.from("stage_events").select("*").eq("order_id", o.id).order("created_at"),
      supabase.from("vendors").select("name, slug").eq("id", o.vendor_id).maybeSingle(),
      supabase.from("branches").select("name, phone, address_line, area, city").eq("id", o.branch_id).maybeSingle(),
      supabase.rpc("get_order_contact" as never, { p_order: o.id } as never),
    ]);

  const itemList = (items ?? []) as OrderItem[];
  const typeIds = [...new Set(itemList.map((i) => i.item_type_id))];
  const { data: types } = typeIds.length
    ? await supabase.from("item_types").select("id, name").in("id", typeIds)
    : { data: [] as { id: string; name: string }[] };
  const typeName: Record<string, string> = {};
  for (const t of (types ?? []) as Pick<ItemType, "id" | "name">[]) typeName[t.id] = t.name;

  const contact = (Array.isArray(contactRows) ? contactRows[0] : null) as OrderContact | null;
  const v = vendor as { name: string; slug: string } | null;
  const b = branch as { name: string; phone: string | null; address_line: string | null; area: string | null; city: string | null } | null;
  const pays = (payments ?? []) as Payment[];
  const paid = pays.some((p) => p.status === "succeeded");
  const isOpen = OPEN.includes(o.status);

  // Timeline: order milestones + processing stage events, oldest first.
  const milestones: { label: string; at: string | null }[] = [
    { label: "Order placed", at: o.created_at },
    { label: "Checked in", at: o.checked_in_at },
    ...((stages ?? []) as StageEvent[]).map((s) => ({ label: STAGE_LABEL[s.stage] ?? s.stage, at: s.created_at })),
    { label: "Ready", at: o.ready_at },
    { label: "Completed", at: o.completed_at },
    { label: "Closed", at: o.closed_at },
    { label: "Cancelled", at: o.cancelled_at },
  ].filter((m) => m.at);
  milestones.sort((a, z) => String(a.at).localeCompare(String(z.at)));

  const money0 = (n: number | null | undefined) => money(Number(n ?? 0));

  return (
    <AdminShell active="/admin/orders" name={profile.full_name} role={profile.role}>
      <Link href="/admin/orders" className="text-sm text-slate">← All orders</Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Order {o.code}</h1>
          <p className="text-sm text-slate">
            {v?.name}{b?.name && b.name !== v?.name ? ` · ${b.name}` : ""} · placed {dateTime(o.created_at)}
          </p>
        </div>
        <span className={statusChip(o.status)}>{STATUS_LABEL[o.status]}</span>
      </div>

      {isOpen && (
        <div className="mt-4 rounded-card border border-warn/30 bg-warn/10 p-4">
          <p className="text-sm font-medium text-warn">Still in progress</p>
          <p className="mt-1 text-xs text-ink/70">
            This order isn&rsquo;t complete yet. Use the customer contact below to follow up
            {!paid && o.payment_timing !== "on_delivery" ? " — payment is still pending." : "."}
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Left: order + items + timeline */}
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-card border border-ink/10 bg-white p-4">
            <h2 className="font-display text-lg text-ink">Order</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Field label="Service">{TIER_LABEL[o.service_tier]}</Field>
              <Field label="Turnaround">{TURNAROUND_LABEL[o.turnaround]}</Field>
              <Field label="Items">{itemList.length}</Field>
              <Field label="Pickup">{o.entry_mode === "pickup" ? "Pick up from customer" : "Drop-off"}</Field>
              <Field label="Return">{o.return_mode === "delivery" ? "Deliver to customer" : "Collection"}</Field>
              <Field label="Wash &amp; dry only">{o.wash_dry ? "Yes" : "No"}</Field>
              {o.notes && <div className="col-span-2 sm:col-span-3"><Field label="Notes">{o.notes}</Field></div>}
            </div>
          </section>

          <section className="rounded-card border border-ink/10 bg-white p-4">
            <h2 className="font-display text-lg text-ink">Items</h2>
            <div className="mt-3 table-scroll">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate">
                  <tr><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Item</th><th className="py-2 pr-3">Service</th><th className="py-2 pr-3">Tag</th><th className="py-2 pr-3">Price</th><th className="py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {itemList.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 pr-3 text-slate">{it.sub_code}</td>
                      <td className="py-2 pr-3 text-ink">
                        {typeName[it.item_type_id] ?? "Item"}
                        {it.condition_notes && <span className="block text-xs text-slate">{it.condition_notes}</span>}
                      </td>
                      <td className="py-2 pr-3 text-slate">{SERVICE_LABEL[it.service]}</td>
                      <td className="py-2 pr-3 text-slate">{it.tag_code ?? "—"}</td>
                      <td className="py-2 pr-3 text-ink">{money0(it.customer_price ?? it.price_at_checkin)}</td>
                      <td className="py-2 text-slate">{it.status}</td>
                    </tr>
                  ))}
                  {itemList.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate">No items checked in yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {((extras ?? []) as OrderExtra[]).length > 0 && (
              <div className="mt-3 border-t border-ink/10 pt-3 text-sm">
                <p className="text-xs text-slate">Extras</p>
                {((extras ?? []) as OrderExtra[]).map((e) => (
                  <div key={e.id} className="flex justify-between"><span className="text-ink">{e.name}</span><span className="text-slate">{money0(e.price)}</span></div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-card border border-ink/10 bg-white p-4">
            <h2 className="font-display text-lg text-ink">Timeline</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {milestones.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-ink">{m.label}</span>
                  <span className="text-xs text-slate">{dateTime(m.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Right: contact + payment + delivery */}
        <div className="space-y-5">
          <OrderContactCard contact={contact} orderCode={o.code} />

          <section className="rounded-card border border-ink/10 bg-white p-4">
            <h2 className="font-display text-lg text-ink">Payment</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate">Status</span>
                <span className={paid ? "chip-ok" : "chip-muted"}>{paid ? "Paid" : o.payment_timing === "on_delivery" ? "Pay on delivery" : "Pending"}</span></div>
              <div className="flex justify-between"><span className="text-slate">Items</span><span className="text-ink">{money0(o.items_total)}</span></div>
              {Number(o.extras_total) > 0 && <div className="flex justify-between"><span className="text-slate">Extras</span><span className="text-ink">{money0(o.extras_total)}</span></div>}
              {Number(o.delivery_fee) > 0 && <div className="flex justify-between"><span className="text-slate">Delivery</span><span className="text-ink">{money0(o.delivery_fee)}</span></div>}
              {Number(o.pickup_fee) > 0 && <div className="flex justify-between"><span className="text-slate">Pickup</span><span className="text-ink">{money0(o.pickup_fee)}</span></div>}
              {Number(o.express_fee) > 0 && <div className="flex justify-between"><span className="text-slate">Express</span><span className="text-ink">{money0(o.express_fee)}</span></div>}
              {Number(o.premium_fee) > 0 && <div className="flex justify-between"><span className="text-slate">Premium</span><span className="text-ink">{money0(o.premium_fee)}</span></div>}
              {Number(o.discount) > 0 && <div className="flex justify-between"><span className="text-slate">Discount</span><span className="text-ink">−{money0(o.discount)}</span></div>}
              {Number(o.bulk_discount) > 0 && <div className="flex justify-between"><span className="text-slate">Bulk discount</span><span className="text-ink">−{money0(o.bulk_discount)}</span></div>}
              <div className="flex justify-between border-t border-ink/10 pt-2 font-medium"><span className="text-ink">Total</span><span className="text-ink">{money0(o.total)}</span></div>
            </div>
          </section>

          <section className="rounded-card border border-ink/10 bg-white p-4">
            <h2 className="font-display text-lg text-ink">Delivery</h2>
            <div className="mt-3 space-y-2 text-sm">
              <Field label="Rider">{o.rider_name ? `${o.rider_name}${o.rider_phone ? ` · ${o.rider_phone}` : ""}` : "Not assigned"}</Field>
              {o.delivered_by && <Field label="Delivered by">{o.delivered_by === "dispatch_partner" ? "Dispatch partner" : "Own rider"}</Field>}
              {o.dispatch_reference && <Field label="Dispatch ref">{o.dispatch_reference}</Field>}
              {b?.name && <Field label="Branch">{b.name}{b.phone ? ` · ${b.phone}` : ""}</Field>}
              {v?.slug && (
                <Link href={`/admin/vendors`} className="inline-block pt-1 text-xs text-ink underline">Manage {v.name}</Link>
              )}
            </div>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
