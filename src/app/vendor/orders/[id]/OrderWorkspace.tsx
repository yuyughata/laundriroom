"use client";

import { useEffect, useState, useTransition } from "react";
import { checkInItem, pressStage, confirmHandover, markOutForDelivery, rescheduleDelivery, confirmPickup, logDispatch } from "../../actions";
import { RiderPicker } from "@/components/riders/RiderPicker";
import { createClient as createBrowser } from "@/lib/supabase/client";
import { QrScanner } from "@/components/ui/QrScanner";
import { customerPrice } from "@/lib/pricing";
import { money, SERVICE_LABEL, STATUS_LABEL, PROCESSING_STAGES, STAGE_LABEL, TIER_LABEL } from "@/lib/format";
import type {
  Order, OrderItem, ItemType, PriceListRow, ServiceType, StageKind, OrderExtra, RiderContact,
} from "@/lib/database.types";

const SERVICES: ServiceType[] = ["wash_and_fold", "dry_clean", "press_only"];

export function OrderWorkspace({
  order, items, itemTypes, prices, paid, customerName, extras, branchName, checkedInBy = {}, showEarnings = false, riders = [], doneStages = [],
}: {
  order: Order; items: OrderItem[]; itemTypes: ItemType[];
  prices: PriceListRow[]; paid: boolean; customerName: string; extras: OrderExtra[];
  /** Shown for business-wide staff of a multi-branch business. */
  branchName?: string | null;
  /** Item sub-code → name of the staff member who checked it in. */
  checkedInBy?: Record<string, string>;
  /** Show what the vendor receives (business-wide managers only). */
  showEarnings?: boolean;
  /** The laundry's saved riders this staff member can use (0045). */
  riders?: RiderContact[]; doneStages?: string[];
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // check-in form state
  const [typeId, setTypeId] = useState(itemTypes[0]?.id ?? "");
  const [service, setService] = useState<ServiceType>("wash_and_fold");
  const [tag, setTag] = useState("");
  const [comment, setComment] = useState("");
  const [condNotes, setCondNotes] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [code, setCode] = useState("");
  const [pickupPin, setPickupPin] = useState("");
  const [dispatchRef, setDispatchRef] = useState(order.dispatch_reference ?? "");

  const priceFor = (t: string, s: ServiceType) =>
    prices.find((p) => p.item_type_id === t && p.service === s)?.price ?? 0;
  // laundriroom's commission is added on top of the vendor's price for the customer
  // (null on orders placed before that change).
  const markup = order.commission_markup ?? null;
  const addPrice = priceFor(typeId, service);
  // What laundriroom adds on top of the vendor's price (express replaces the commission).
  const addedOnTop = [
    markup ? `laundriroom’s ${Math.round(Number(markup) * 1000) / 10}% commission` : null,
    order.express_fee > 0 ? "the express charge" : null,
    order.premium_fee > 0 ? "the premium charge" : null,
  ].filter(Boolean) as string[];

  const canCheckIn = ["awaiting_dropoff", "pickup_requested", "checked_in", "processing"].includes(order.status);
  const nextStageIndex = 0; // processing stages are free-press in this build
  const isDelivery = order.return_mode === "delivery";

  function run(fn: () => Promise<{ error?: string } | void>, onOk?: () => void) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) setErr(r.error);
      else onOk?.();
    });
  }
  // Stages already pressed stay filled in ink, so staff can see where the batch is.
  const [done, setDone] = useState<Set<string>>(() => new Set(doneStages));
  useEffect(() => { setDone(new Set(doneStages)); }, [doneStages.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const [handoverErr, setHandoverErr] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl text-ink">{order.code}</h1>
          <p className="text-sm text-slate">
            {customerName} · {order.entry_mode === "pickup" ? "Pickup" : "Drop-off"} ·{" "}
            {isDelivery ? "Deliver back" : "Collect"} ·{" "}
            {order.payment_timing === "on_delivery" ? "Pay on delivery" : "Pay online"}
            {branchName ? ` · ${branchName} branch` : ""}
          </p>
        </div>
        <span className="chip-ink">{STATUS_LABEL[order.status]}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <span className={order.service_tier === "premium" ? "chip-ink" : "chip-muted"}>{TIER_LABEL[order.service_tier]}</span>
        {order.turnaround === "express" && <span className="chip-warn">Express</span>}
      </div>

      {err && <p className="mt-3 text-sm text-danger">{err}</p>}

      {/* Pickup confirmation (rider collects from the customer) */}
      {order.entry_mode === "pickup" && !order.picked_up_at && (
        <div className="card mt-4 border-warn/40 p-4">
          <p className="label">Confirm pickup</p>
          <p className="text-xs text-slate">Ask the customer for their 4-digit pickup PIN to confirm collection.</p>
          <div className="mt-2 flex gap-2">
            <input className="field max-w-[160px]" inputMode="numeric" maxLength={4} placeholder="0000"
              value={pickupPin} onChange={(e) => setPickupPin(e.target.value)} />
            <button className="btn-primary" disabled={pending || pickupPin.length < 4}
              onClick={() => run(async () => {
                const r = await confirmPickup(order.id, pickupPin);
                if (!(r && "error" in r)) setPickupPin("");
                return r;
              })}>
              Confirm pickup
            </button>
          </div>
        </div>
      )}
      {order.entry_mode === "pickup" && order.picked_up_at && (
        <p className="mt-3 text-xs text-teal">Pickup confirmed.</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* LEFT: items + check-in */}
        <div>
          <h2 className="font-display text-lg text-ink">Items</h2>
          <div className="mt-3 space-y-2">
            {items.length === 0 && <p className="text-sm text-slate">No items checked in yet.</p>}
            {items.map((it) => {
              const t = itemTypes.find((x) => x.id === it.item_type_id);
              return (
                <div key={it.id} className="card flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{it.sub_code} · {t?.name ?? "Item"}</p>
                    <p className="text-xs text-slate">
                      {SERVICE_LABEL[it.service]}{it.tag_code ? ` · tag ${it.tag_code}` : " · no tag"}
                      {checkedInBy[it.sub_code] ? ` · checked in by ${checkedInBy[it.sub_code]}` : ""}
                    </p>
                    {it.customer_comment && <p className="text-xs text-slate">“{it.customer_comment}”</p>}
                    {it.condition_notes && <p className="text-xs text-warn">Condition: {it.condition_notes}</p>}
                    {it.photos?.length > 0 && <p className="text-xs text-slate">📷 {it.photos.length} photo{it.photos.length === 1 ? "" : "s"}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-ink">{money(it.price_at_checkin)}</p>
                    {markup != null && it.customer_price != null && Number(it.customer_price) !== Number(it.price_at_checkin) && (
                      <p className="text-xs text-slate">customer pays {money(it.customer_price)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {canCheckIn && (
            <div className="card mt-4 p-4">
              <p className="label">Check in an item</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="field" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                  {itemTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="field" value={service} onChange={(e) => setService(e.target.value as ServiceType)}>
                  {SERVICES.map((s) => (
                    <option key={s} value={s}>{SERVICE_LABEL[s]} · {money(priceFor(typeId, s))}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input className="field flex-1" placeholder="Tag code (scan or type) — required" aria-label="Tag code" value={tag}
                    onChange={(e) => setTag(e.target.value)} />
                  <QrScanner onResult={(t) => setTag(t)} label="Scan tag" />
                </div>
                <input className="field" placeholder="Customer note (optional)" value={comment}
                  onChange={(e) => setComment(e.target.value)} />
                <input className="field sm:col-span-2" placeholder="Condition notes — stains, damage, wear (optional)"
                  value={condNotes} onChange={(e) => setCondNotes(e.target.value)} />
                <div className="sm:col-span-2">
                  <label className="label">Photos <span className="font-normal text-slate">(optional — useful as evidence of existing damage)</span></label>
                  <input type="file" accept="image/*" multiple className="text-sm"
                    onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))} />
                  {photoFiles.length > 0 && <span className="ml-2 text-xs text-slate">{photoFiles.length} selected</span>}
                </div>
              </div>
              <button className="btn-primary mt-3 w-full" disabled={pending || uploading || !typeId || !tag.trim()}
                onClick={() => run(async () => {
                  setUploading(true);
                  const paths: string[] = [];
                  if (photoFiles.length) {
                    const sb = createBrowser();
                    for (const f of photoFiles) {
                      const path = `${order.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
                      const { error } = await sb.storage.from("item-photos").upload(path, f);
                      if (!error) paths.push(path);
                    }
                  }
                  setUploading(false);
                  const fd = new FormData();
                  fd.set("order_id", order.id); fd.set("item_type_id", typeId);
                  fd.set("service", service); fd.set("tag_code", tag);
                  fd.set("customer_comment", comment); fd.set("condition_notes", condNotes);
                  fd.set("photos", JSON.stringify(paths));
                  const r = await checkInItem(fd);
                  if (!(r && "error" in r)) { setTag(""); setComment(""); setCondNotes(""); setPhotoFiles([]); }
                  return r;
                })}>
                {uploading ? "Uploading…" : `Add item · ${money(addPrice)}${markup ? ` (customer pays ${money(customerPrice(addPrice, markup))})` : ""}`}
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: stages + handover */}
        <div className="space-y-6">
          <div className="card p-4">
            <p className="label">Processing stages</p>
            <div className="grid grid-cols-2 gap-2">
              {PROCESSING_STAGES.map((s) => {
                const isDone = done.has(s);
                return (
                  <button key={s} aria-pressed={isDone}
                    className={`${isDone ? "btn-primary" : "btn-ghost"} justify-center text-xs`}
                    disabled={pending || items.length === 0}
                    onClick={() => run(() => pressStage(order.id, s), () => setDone((d) => new Set(d).add(s)))}>
                    {isDone ? "✓ " : ""}{STAGE_LABEL[s]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate">Press a stage as the batch moves through it. Done stages stay dark.</p>
          </div>

          {/* Return leg */}
          {["ready", "out_for_delivery", "awaiting_collection"].includes(order.status) && (
            <div className="card p-4">
              <p className="label">{isDelivery ? "Delivery" : "Collection"}</p>

              {isDelivery && (
                <RiderPicker orderId={order.id} orderCode={order.code} contacts={riders}
                  current={{ name: order.rider_name, phone: order.rider_phone, contactId: order.rider_contact_id ?? null }} />
              )}

              {isDelivery && order.delivered_by === "dispatch_partner" && (
                <div className="mb-3">
                  <label className="label">Dispatch booking reference</label>
                  <div className="flex gap-2">
                    <input className="field" placeholder="Booked outside the app — log the ref"
                      value={dispatchRef} onChange={(e) => setDispatchRef(e.target.value)} />
                    <button className="btn-ghost text-xs" disabled={pending}
                      onClick={() => run(() => logDispatch(order.id, dispatchRef))}>Save</button>
                  </div>
                </div>
              )}

              {isDelivery && order.status === "ready" && (
                <button className="btn-primary w-full" disabled={pending}
                  onClick={() => run(() => markOutForDelivery(order.id))}>
                  {order.delivery_attempts > 0 ? "Re-send out for delivery" : "Send out for delivery"}
                </button>
              )}

              {/* Delivery didn't happen → reschedule */}
              {isDelivery && order.status === "out_for_delivery" && (
                <div className="mt-3 rounded-card border border-ink/10 p-3">
                  <p className="text-xs font-medium text-ink">Delivery didn&apos;t happen?</p>
                  <p className="mt-1 text-xs text-slate">
                    Reschedule it. If the customer wasn&apos;t available a penalty applies; a missing
                    item or our error has no penalty.
                  </p>
                  <div className="mt-2 grid gap-2">
                    <button className="btn-ghost justify-center text-xs" disabled={pending}
                      onClick={() => run(() => rescheduleDelivery(order.id, true))}>
                      Customer unavailable — apply penalty
                    </button>
                    <button className="btn-ghost justify-center text-xs" disabled={pending}
                      onClick={() => run(() => rescheduleDelivery(order.id, false))}>
                      Missing item / our error — no penalty
                    </button>
                  </div>
                </div>
              )}

              {order.delivery_attempts > 0 && (
                <p className="mt-2 text-xs text-slate">
                  {order.delivery_attempts} delivery attempt{order.delivery_attempts === 1 ? "" : "s"}
                  {order.reschedule_penalty > 0 ? ` · ${money(order.reschedule_penalty)} penalty` : ""}
                </p>
              )}

              {/* Payment first, then the customer's code closes the order (0046). */}
              <div className={`mt-3 rounded-card p-3 text-sm ${paid ? "bg-teal/10" : "bg-warn/10"}`}>
                <p className={`font-medium ${paid ? "text-ink" : "text-warn"}`}>
                  {paid ? `Paid · ${money(order.total)}` : `Waiting for payment · ${money(order.total)}`}
                </p>
                <p className="mt-1 text-xs text-ink">
                  {paid
                    ? "Payment confirmed. Ask the customer for their 4-digit delivery code and enter it to close the order."
                    : "Ask the customer to tap Pay now in their order (or the payment email). Once payment is confirmed, enter their 4-digit delivery code to close the order."}
                </p>
              </div>
              <div className="mt-3">
                <label className="label" htmlFor="handover-code">Customer&apos;s delivery code</label>
                <div className="flex gap-2">
                  <input id="handover-code" className="field" inputMode="numeric" maxLength={4} placeholder="0000"
                    value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setHandoverErr(null); }} />
                  <button className="btn-primary" disabled={pending || code.length < 4}
                    onClick={() => {
                      setHandoverErr(null);
                      start(async () => {
                        const r = await confirmHandover(order.id, code);
                        if (r && "error" in r && r.error) setHandoverErr(r.error); else setCode("");
                      });
                    }}>
                    Confirm
                  </button>
                </div>
                {handoverErr && <p role="alert" className="mt-2 rounded-card bg-danger/10 px-3 py-2 text-xs text-danger">{handoverErr}</p>}
              </div>
            </div>
          )}

          {extras.length > 0 && (
            <div className="card p-4">
              <p className="label">Premium extras</p>
              <div className="space-y-1">
                {extras.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate">{e.name}</span>
                    <span className="text-ink">{money(e.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            {markup != null && <p className="label">What the customer pays</p>}
            <Row label="Items" value={money(order.items_total)} />
            {order.extras_total > 0 && <Row label="Premium extras" value={money(order.extras_total)} />}
            {order.premium_fee > 0 && <Row label="Premium service" value={money(order.premium_fee)} />}
            {order.express_fee > 0 && <Row label="Express" value={money(order.express_fee)} />}

            {order.pickup_fee > 0 && <Row label="Pickup" value={money(order.pickup_fee)} />}
            <Row label="Delivery" value={order.delivery_fee > 0 ? money(order.delivery_fee) : "Free"} />
            {order.reschedule_penalty > 0 && <Row label="Re-delivery penalty" value={money(order.reschedule_penalty)} />}
            {order.discount > 0 && <Row label={`Promo ${order.promo_code ?? ""}`} value={`− ${money(order.discount)}`} />}
            {order.bulk_discount > 0 && <Row label="Bulk discount" value={`− ${money(order.bulk_discount)}`} />}
            <div className="my-2 border-t border-ink/10" />
            <Row label="Total" value={money(order.total)} strong />
            <Row label="Payment" value={paid ? "Paid" : order.payment_timing === "on_delivery" ? "On delivery" : "Online — pending"} />
            {showEarnings && markup != null && (
              <>
                <div className="my-2 border-t border-ink/10" />
                <Row label="You receive" value={money(order.vendor_earnings ?? 0)} strong />
                <p className="mt-1 text-xs text-slate">
                  Your prices{order.extras_total > 0 ? ", extras" : ""}{order.pickup_fee > 0 ? ", pickup" : ""}
                  {order.delivered_by !== "dispatch_partner" && order.delivery_fee > 0 ? " and delivery" : ""}, in full
                  {order.discount_vendor_funded && order.discount > 0 ? ", less your share of the promo" : ""}.
                  {order.delivered_by === "dispatch_partner" && order.delivery_fee > 0 && (
                    <> The {money(order.delivery_fee)} delivery fee is collected by laundriroom to pay the dispatch company.</>
                  )}
                  {addedOnTop.length > 0 && <> {addedOnTop.join(" and ")} {addedOnTop.length > 1 ? "are" : "is"} added on top for the customer.</>}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
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
