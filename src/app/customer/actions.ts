"use server";

import { cleanPromoParam } from "@/lib/promoLinks";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isVendorOpenNow } from "@/lib/hours";
import { notifyUser, notifyOrder } from "@/lib/notify";
import { loadPricing, quoteDelivery, type DeliveryQuote } from "@/lib/deliveryPricing";
import { geocode, addressText, mapsConfigured, drivingDistancesKm, straightKm, type LatLng } from "@/lib/maps";
import type {
  EntryMode, ReturnMode, DeliveredBy, PaymentTiming, ServiceTier, Turnaround,
} from "@/lib/database.types";

type BranchRow = {
  id: string; vendor_id: string; active: boolean; is_open: boolean; opens_at: string | null; closes_at: string | null;
  lat: number | null; lng: number | null; address_line: string | null; area: string | null; city: string | null;
};

/**
 * The branch an order goes to: the one chosen, else the vendor's main branch.
 * Returns null on a database without branches yet (migration 0033).
 */
async function resolveBranch(supabase: ReturnType<typeof createClient>, vendorId: string, branchId: string) {
  let q = supabase.from("branches")
    .select("id, vendor_id, active, is_open, opens_at, closes_at, lat, lng, address_line, area, city")
    .eq("vendor_id", vendorId);
  q = branchId ? q.eq("id", branchId) : q.eq("is_main", true);
  const { data, error } = await q.maybeSingle();
  if (error) return { missingTable: true as const };
  return { branch: (data as BranchRow | null) ?? null };
}

/** The customer's address for pickup/delivery: a saved one, or a new one (saved, placed on the map). */
async function resolveAddress(supabase: ReturnType<typeof createClient>, userId: string, formData: FormData) {
  const addressId = String(formData.get("address_id") || "");
  if (addressId && addressId !== "new") {
    const { data } = await supabase.from("customer_addresses")
      .select("id, line1, area, city, lat, lng").eq("id", addressId).eq("customer_id", userId).maybeSingle();
    if (!data) return { error: "Choose one of your saved addresses, or add a new one." };
    return { address: data as { id: string; line1: string; area: string | null; city: string | null; lat: number | null; lng: number | null } };
  }
  const line1 = String(formData.get("address_line1") || "").trim();
  const area = String(formData.get("address_area") || "").trim() || null;
  const city = String(formData.get("address_city") || "").trim() || null;
  if (!line1) return { error: "Enter the address for pickup or delivery." };
  const at = mapsConfigured() ? await geocode(addressText({ line1, area, city })) : null;
  const { count } = await supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("customer_id", userId);
  const { data, error } = await supabase.from("customer_addresses")
    .insert({ customer_id: userId, label: count ? "Address" : "Home", line1, area, city,
              lat: at?.lat ?? null, lng: at?.lng ?? null, is_default: !count } as never)
    .select("id, line1, area, city, lat, lng").single();
  if (error) return { error: error.message };
  return { address: data as { id: string; line1: string; area: string | null; city: string | null; lat: number | null; lng: number | null } };
}

/**
 * Delivery fee preview for the order form. Uses the admin's pricing: the flat
 * fee, or the Google Maps distance from the branch to the address. The order
 * itself is priced again on the server when it's placed.
 */
export async function quoteDeliveryFee(input: {
  vendorId: string; branchId?: string; addressId?: string; line1?: string; area?: string; city?: string;
}): Promise<DeliveryQuote | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const pricing = await loadPricing(supabase);
  if (pricing.mode === "flat") return { fee: pricing.flat, km: null, pricedBy: "flat" };

  const b = await resolveBranch(supabase, input.vendorId, input.branchId ?? "");
  const branch = "branch" in b ? b.branch ?? null : null;
  let to: { line1?: string | null; area?: string | null; city?: string | null; lat?: number | null; lng?: number | null } | null = null;
  if (input.addressId && input.addressId !== "new") {
    const { data } = await supabase.from("customer_addresses")
      .select("line1, area, city, lat, lng").eq("id", input.addressId).eq("customer_id", user.id).maybeSingle();
    to = data as typeof to;
  } else if ((input.line1 ?? "").trim()) {
    to = { line1: input.line1, area: input.area, city: input.city };
  }
  if (!to) return { fee: pricing.flat, km: null, pricedBy: "flat", note: "Add your address to see the delivery fee." };
  return quoteDelivery(pricing, branch, to);
}

/**
 * Nearest laundries: distance from the customer (a saved address, or the
 * phone's location) to every active branch. Straight-line distance picks the
 * 10 closest; Google's Routes API then gives road distances for those in one
 * request (no key / no answer → straight-line). Returns branch id → km.
 */
export async function nearestBranches(input: { addressId?: string; lat?: number; lng?: number }):
  Promise<{ km: Record<string, number>; by: "road" | "straight" } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  let from: LatLng | null = null;
  if (input.addressId && input.addressId !== "new") {
    const { data } = await supabase.from("customer_addresses")
      .select("line1, area, city, lat, lng").eq("id", input.addressId).eq("customer_id", user.id).maybeSingle();
    const a = data as { line1: string; area: string | null; city: string | null; lat: number | null; lng: number | null } | null;
    if (!a) return { error: "Address not found." };
    from = a.lat != null && a.lng != null ? { lat: Number(a.lat), lng: Number(a.lng) } : await geocode(addressText(a));
    if (!from) return { error: "We couldn't place that address on the map. Try “Use my location” instead." };
  } else if (Number.isFinite(input.lat) && Number.isFinite(input.lng)
    && Math.abs(input.lat!) <= 90 && Math.abs(input.lng!) <= 180) {
    from = { lat: Number(input.lat), lng: Number(input.lng) };
  } else {
    return { error: "Choose an address or use your location." };
  }

  const { data: rows } = await supabase.from("branches").select("id, lat, lng, address_line, area, city").eq("active", true);
  const branches = ((rows ?? []) as { id: string; lat: number | null; lng: number | null; address_line: string | null; area: string | null; city: string | null }[]);
  const placed: { id: string; at: LatLng; straight: number }[] = [];
  for (const b of branches) {
    const at = b.lat != null && b.lng != null ? { lat: Number(b.lat), lng: Number(b.lng) } : null;
    if (at) placed.push({ id: b.id, at, straight: straightKm(from, at) });
  }
  placed.sort((a, b) => a.straight - b.straight);
  const km: Record<string, number> = {};
  for (const p of placed) km[p.id] = p.straight;
  if (!mapsConfigured() || placed.length === 0) return { km, by: "straight" };

  const top = placed.slice(0, 10);
  const road = await drivingDistancesKm(from, top.map((p) => p.at));
  let any = false;
  top.forEach((p, i) => { if (road[i] != null) { km[p.id] = road[i]!; any = true; } });
  return { km, by: any ? "road" : "straight" };
}

/** Create an order. Items are added by the vendor at check-in (plan rule). */
export async function createOrder(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const vendor_id = String(formData.get("vendor_id") || "");
  const branchChoice = String(formData.get("branch_id") || "");
  const entry_mode = String(formData.get("entry_mode") || "drop_off") as EntryMode;
  const return_mode = String(formData.get("return_mode") || "collection") as ReturnMode;
  const payment_timing = String(formData.get("payment_timing") || "online") as PaymentTiming;
  const service_tier = String(formData.get("service_tier") || "standard") as ServiceTier;
  const turnaround = String(formData.get("turnaround") || "normal") as Turnaround;
  const delivered_by = (formData.get("delivered_by") as DeliveredBy | null) || null;
  const notes = String(formData.get("notes") || "") || null;
  const extraIds = formData.getAll("extras").map(String).filter(Boolean);
  // Placed from the vendor's own profile link (/v/<slug>)?
  const via_vendor_link = formData.get("via_vendor_link") === "1";

  if (!vendor_id) return { error: "Please choose a laundry." };

  const { data: vendor } = await supabase
    .from("vendors").select("status, is_open, opens_at, closes_at").eq("id", vendor_id).maybeSingle();
  if (!vendor || vendor.status !== "verified") return { error: "That laundry isn't available." };

  // The branch, and its opening hours (drop-off and pickup follow them).
  const b = await resolveBranch(supabase, vendor_id, branchChoice);
  const branch = "branch" in b ? b.branch ?? null : null;
  if ("branch" in b && (!branch || !branch.active)) return { error: "That branch isn't taking orders. Please choose another." };
  if (!isVendorOpenNow(branch ?? vendor)) {
    return { error: "That branch is closed right now. Drop-off and pickup follow its opening hours." };
  }

  // The customer's address, needed for a pickup or a delivery.
  let addressId: string | null = null;
  let address: { line1: string; area: string | null; city: string | null; lat: number | null; lng: number | null } | null = null;
  if (entry_mode === "pickup" || return_mode === "delivery") {
    const a = await resolveAddress(supabase, user.id, formData);
    if ("error" in a) return { error: a.error };
    addressId = a.address.id;
    address = a.address;
  }

  // Trip fees: pickup and/or delivery each cost a trip between the branch and
  // the customer's address — the admin's flat fee, or priced by distance
  // (Google Maps). An order that's both picked up and delivered pays both.
  let delivery_fee = 0;
  let pickup_fee = 0;
  let distanceKm: number | null = null;
  let pickupKm: number | null = null;
  if (return_mode === "delivery" || entry_mode === "pickup") {
    const q = await quoteDelivery(await loadPricing(supabase), branch, address);
    if (return_mode === "delivery") { delivery_fee = q.fee; distanceKm = q.km; }
    if (entry_mode === "pickup")    { pickup_fee = q.fee; pickupKm = q.km; }
  }

  // Express/premium markups are percentages applied by DB triggers once items
  // are priced at check-in, so nothing tier/speed-related is charged up front.
  const { data, error } = await supabase
    .from("orders")
    .insert({
      customer_id: user.id,
      vendor_id,
      ...(branch ? { branch_id: branch.id } : {}),
      entry_mode,
      return_mode,
      delivered_by: return_mode === "delivery" ? delivered_by : null,
      payment_timing,
      service_tier,
      turnaround,
      delivery_fee,
      pickup_fee,
      ...(distanceKm != null ? { delivery_distance_km: distanceKm } : {}),
      ...(pickupKm != null ? { pickup_distance_km: pickupKm } : {}),
      pickup_address_id: addressId,
      total: delivery_fee, // items/extras/markups recompute via triggers
      notes,
      via_vendor_link,
      status: entry_mode === "pickup" ? "pickup_requested" : "awaiting_dropoff",
    } as never)
    .select("id")
    .single();

  if (error) return { error: error.message };
  const orderId = (data as { id: string }).id;

  // Snapshot chosen premium extras onto the order (premium tier only).
  if (service_tier === "premium" && extraIds.length > 0) {
    const { data: extras } = await supabase
      .from("service_extras").select("id, name, price").in("id", extraIds).eq("active", true);
    const rows = (extras ?? []).map((e) => ({
      order_id: orderId, extra_id: e.id, name: e.name, price: e.price,
    }));
    if (rows.length > 0) await supabase.from("order_extras").insert(rows as never);
  }

  // Tell admins + the vendor's staff, and confirm to the customer (best-effort,
  // in parallel; never blocks the order).
  await Promise.all([notifyOrder("order_placed", orderId), notifyOrder("order_confirmed", orderId)]);

  // A promo code from a QR code / link: apply it now. If it can't be used, the
  // order still stands and the order page says why.
  const promo = cleanPromoParam(formData.get("promo"));
  let promoNote = "";
  if (promo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: pErr } = await (supabase.rpc as any)("redeem_promo", { p_code: promo, p_order: orderId });
    promoNote = pErr
      ? `?promo_error=${encodeURIComponent(`${promo}: ${pErr.message.replace(/^.*:\s*/, "")}`)}`
      : `?promo_applied=${encodeURIComponent(promo)}`;
  }

  revalidatePath("/customer");
  redirect(`/customer/orders/${orderId}${promoNote}`);
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
  // A 1–2★ review: tell the vendor to follow up, and flag it to admins.
  if (rating <= 2) await notifyOrder("review_low", orderId);
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
      body: JSON.stringify({ order_id: orderId, site_url: process.env.NEXT_PUBLIC_SITE_URL || "" }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    if (res?.ok && json?.authorization_url) redirect(json.authorization_url as string);
    // Show the reason (the provider's own words when it refused), not a dead end.
    const reason = typeof json?.error === "string" ? json.error : null;
    if (!res) return { error: "We couldn't reach the payment service. Check your connection and try again." };
    if (res.status === 409 || res.status === 400) return { error: reason ?? "This order can't be paid right now." };
    return { error: reason ? `The payment provider said: ${reason}` : "We couldn't start the payment. Please try again in a moment." };
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

/**
 * Update the signed-in user's name, phone and/or email. Name and phone save
 * straight away; an email change is confirmed by Supabase (it emails a link)
 * and profiles.email follows once confirmed. Emails an "account updated"
 * notice listing what changed.
 */
export async function updateMyProfile(_prev: unknown, formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const full_name = String(formData.get("full_name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!full_name) return { error: "Enter your name." };
  if (!phone) return { error: "Enter your phone number." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };

  const { data: current } = await supabase.from("profiles").select("full_name, phone, email").eq("id", user.id).single();
  const changes: string[] = [];
  if (current?.full_name !== full_name) changes.push("Name");
  if ((current?.phone ?? "") !== phone) changes.push("Phone");

  if (changes.length) {
    const { error } = await supabase.from("profiles").update({ full_name, phone } as never).eq("id", user.id);
    if (error) return { error: error.message };
  }

  let emailPending = false;
  if (email !== (user.email ?? "").toLowerCase()) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${siteUrl}/auth/callback?next=/customer/account` });
    if (error) return { error: error.message };
    emailPending = true;
    changes.push("Email (pending confirmation)");
  }

  if (!changes.length) return { ok: true, message: "Nothing changed." };
  await notifyUser("account_updated", user.id, { changes: changes.join(", ") });
  revalidatePath("/customer/account");
  return {
    ok: true,
    message: emailPending
      ? `Saved. To finish changing your email, tap the link we sent to ${email}.`
      : "Saved.",
  };
}
