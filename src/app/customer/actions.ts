"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isVendorOpenNow } from "@/lib/hours";
import type {
  EntryMode, ReturnMode, DeliveredBy, PaymentTiming, ServiceTier, Turnaround,
} from "@/lib/database.types";

/** Create an order. Items are added by the vendor at check-in (plan rule). */
export async function createOrder(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const vendor_id = String(formData.get("vendor_id") || "");
  const entry_mode = String(formData.get("entry_mode") || "drop_off") as EntryMode;
  const return_mode = String(formData.get("return_mode") || "collection") as ReturnMode;
  const payment_timing = String(formData.get("payment_timing") || "online") as PaymentTiming;
  const service_tier = String(formData.get("service_tier") || "standard") as ServiceTier;
  const turnaround = String(formData.get("turnaround") || "normal") as Turnaround;
  const delivered_by = (formData.get("delivered_by") as DeliveredBy | null) || null;
  const notes = String(formData.get("notes") || "") || null;
  const extraIds = formData.getAll("extras").map(String).filter(Boolean);

  if (!vendor_id) return { error: "Please choose a laundry." };

  // Drop-off and pickup follow the laundry's opening hours.
  const { data: vendor } = await supabase
    .from("vendors").select("status, is_open, opens_at, closes_at").eq("id", vendor_id).maybeSingle();
  if (!vendor || vendor.status !== "verified") return { error: "That laundry isn't available." };
  if (!isVendorOpenNow(vendor)) {
    return { error: "That laundry is closed right now. Drop-off and pickup follow its opening hours." };
  }

  // delivery fee: global flat rule (admin can refine by zone/vendor later)
  let delivery_fee = 0;
  if (return_mode === "delivery") {
    const { data: rule } = await supabase
      .from("delivery_fee_rules").select("flat_amount")
      .eq("scope", "global").eq("active", true).limit(1).maybeSingle();
    delivery_fee = Number(rule?.flat_amount ?? 0);
  }

  // Express/premium markups are percentages applied by DB triggers once items
  // are priced at check-in, so nothing tier/speed-related is charged up front.
  const { data, error } = await supabase
    .from("orders")
    .insert({
      customer_id: user.id,
      vendor_id,
      entry_mode,
      return_mode,
      delivered_by: return_mode === "delivery" ? delivered_by : null,
      payment_timing,
      service_tier,
      turnaround,
      delivery_fee,
      total: delivery_fee, // items/extras/markups recompute via triggers
      notes,
      status: entry_mode === "pickup" ? "pickup_requested" : "awaiting_dropoff",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Snapshot chosen premium extras onto the order (premium tier only).
  if (service_tier === "premium" && extraIds.length > 0) {
    const { data: extras } = await supabase
      .from("service_extras").select("id, name, price").in("id", extraIds).eq("active", true);
    const rows = (extras ?? []).map((e) => ({
      order_id: data.id, extra_id: e.id, name: e.name, price: e.price,
    }));
    if (rows.length > 0) await supabase.from("order_extras").insert(rows as never);
  }

  revalidatePath("/customer");
  redirect(`/customer/orders/${data.id}`);
}

/** Apply a promo code to an order (validated + redeemed in the DB). */
export async function applyPromo(orderId: string, code: string) {
  const supabase = createClient();
  if (!code.trim()) return { error: "Enter a code." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("redeem_promo", { p_code: code.trim(), p_order: orderId });
  if (error) return { error: error.message.replace(/^.*:\s*/, "") };
  revalidatePath(`/customer/orders/${orderId}`);
  revalidatePath(`/customer/pay/${orderId}`);
  return { ok: true };
}

/** Raise a damage/loss claim against an order (optionally a specific item). */
export async function createClaim(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const order_id = String(formData.get("order_id"));
  const order_item_id = String(formData.get("order_item_id") || "") || null;
  const type = String(formData.get("type") || "damage");
  const description = String(formData.get("description") || "").trim();
  if (!description) return { error: "Please describe what happened." };

  const { data: order } = await supabase.from("orders").select("vendor_id, customer_id").eq("id", order_id).single();
  if (!order || order.customer_id !== user.id) return { error: "Order not found." };

  const { error } = await supabase.from("claims").insert({
    order_id, order_item_id, customer_id: user.id, vendor_id: order.vendor_id, type, description,
  } as never);
  if (error) return { error: error.message };
  revalidatePath(`/customer/orders/${order_id}`);
  return { ok: true };
}

/** Submit a rating + optional comment for a completed order. */
export async function submitReview(orderId: string, vendorId: string, rating: number, comment: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (rating < 1 || rating > 5) return { error: "Please choose a rating." };

  const { error } = await supabase.from("reviews").insert({
    order_id: orderId, customer_id: user.id, vendor_id: vendorId,
    rating, comment: comment.trim() || null,
  } as never);
  if (error) {
    if (error.code === "23505") return { error: "You've already reviewed this order." };
    return { error: error.message };
  }
  revalidatePath(`/customer/orders/${orderId}`);
  return { ok: true };
}

/**
 * Pay now. With a payment key configured this creates a transaction through
 * the `create-payment` edge function and redirects to the provider's checkout;
 * the webhook then marks the payment succeeded. If that hand-off fails we show
 * an error — never fall through to the simulator, or the order would be
 * marked paid for free.
 *
 * Without payment keys, local development (or ALLOW_SIMULATED_PAYMENTS=true)
 * records a succeeded payment with the service client so the full flow
 * (close order → schedule payout) can be exercised end to end.
 */
export async function payNow(orderId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase
    .from("orders").select("id, total, customer_id, status").eq("id", orderId).single();
  if (!order || order.customer_id !== user.id) return { error: "Order not found." };

  // Production path: hand off to the payment edge function (returns a checkout URL).
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-payment`;
  if (process.env.PAYSTACK_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY) {
    // The edge function checks this token to confirm the caller owns the order,
    // then returns { authorization_url } — redirect the customer there.
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session?.access_token ?? ""}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify({ order_id: orderId }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    if (res?.ok && json?.authorization_url) redirect(json.authorization_url as string);
    return { error: "We couldn't start the payment. Please try again in a moment." };
  }

  // Simulator: only when no payment provider is configured, and only in local
  // development unless explicitly allowed (e.g. on a staging deploy).
  const simulate =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_SIMULATED_PAYMENTS === "true";
  if (!simulate) {
    return { error: "Online payment isn't set up yet. Please contact support." };
  }
  const service = createServiceClient();
  if (!service) {
    return {
      error:
        "Payments are not configured. Add PAYSTACK_SECRET_KEY (prod) or SUPABASE_SERVICE_ROLE_KEY (dev) to simulate.",
    };
  }
  const { error } = await service.from("payments").insert({
    order_id: orderId,
    amount: order.total,
    method: "paystack",
    status: "succeeded",
    reference: `dev_${Date.now()}`,
    paid_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  revalidatePath(`/customer/orders/${orderId}`);
  redirect(`/customer/orders/${orderId}?paid=1`);
}
