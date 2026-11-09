"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getVendorContext } from "@/lib/vendor";
import { notifyOrder } from "@/lib/notify";
import { loadPricing, quoteDelivery } from "@/lib/deliveryPricing";
import { geocode, addressText, mapsConfigured } from "@/lib/maps";
import type {
  ServiceType, StageKind, EntryMode, ReturnMode, DeliveredBy, PaymentTiming, ServiceTier, Turnaround,
} from "@/lib/database.types";

/** Attendant checks in an item: creates an order_item (price snapshot + sub-code by trigger). */
export async function checkInItem(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const order_id = String(formData.get("order_id"));
  const item_type_id = String(formData.get("item_type_id"));
  const service = String(formData.get("service")) as ServiceType;
  const customer_comment = String(formData.get("customer_comment") || "") || null;
  const condition_notes = String(formData.get("condition_notes") || "") || null;
  const tag_code = String(formData.get("tag_code") || "").trim().toUpperCase() || null;
  // Every item carries one of this laundry's printed tags (checked again in the
  // database by check_item_tag, 0046).
  if (!tag_code) return { error: "Scan or type the item's tag. Print tags at Tags if you've run out." };
  let photos: string[] = [];
  try { photos = JSON.parse(String(formData.get("photos") || "[]")); } catch { photos = []; }

  const { error } = await supabase.from("order_items").insert({
    order_id, item_type_id, service, customer_comment, condition_notes, tag_code, photos,
  } as never);
  if (error) return { error: tagError(error.message) ?? error.message };

  // record the check-in stage once (first item)
  const { count } = await supabase
    .from("stage_events").select("*", { count: "exact", head: true })
    .eq("order_id", order_id).eq("stage", "check_in");
  if (!count) {
    await supabase.from("stage_events").insert({ order_id, stage: "check_in", pressed_by: user?.id } as never);
  }

  revalidatePath(`/vendor/orders/${order_id}`);
  return { ok: true };
}

/** check_item_tag() errors → what to do about them. */
function tagError(m: string): string | null {
  const after = (k: string) => m.split(`${k}:`)[1]?.trim() ?? "";
  if (m.includes("TAG_UNKNOWN")) return `${after("TAG_UNKNOWN")} isn't one of your tags. Use a tag printed from Tags (generate more there if needed).`;
  if (m.includes("TAG_IN_USE")) return `That tag is already on another item (${after("TAG_IN_USE")}). Use a free tag.`;
  if (m.includes("TAG_UNAVAILABLE")) return `That tag is marked ${after("TAG_UNAVAILABLE")}. Mark it found at Tags, or use another tag.`;
  return null;
}

/** Press a processing stage. */
export async function pressStage(order_id: string, stage: StageKind) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("stage_events").insert({ order_id, stage, pressed_by: user?.id } as never);
  if (error) return { error: error.message };
  revalidatePath(`/vendor/orders/${order_id}`);
  return { ok: true };
}

/**
 * Close an order with the customer's 4-digit delivery code. confirm_handover()
 * (0046) checks payment first: until a payment has succeeded the code isn't
 * accepted and the order stays Ready / Out for delivery.
 */
export async function confirmHandover(order_id: string, code: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("confirm_handover" as never, { p_order: order_id, p_code: code.trim() } as never);
  if (error) {
    const m = error.message;
    if (m.includes("PAYMENT_PENDING")) {
      const amount = m.split("PAYMENT_PENDING:")[1]?.trim();
      return { error: `Payment isn't confirmed yet${amount ? ` (${amount})` : ""}. Ask the customer to tap Pay now in their order or the payment email, wait for it to go through, then enter the code again.` };
    }
    if (m.includes("WRONG_CODE")) return { error: "That code doesn't match. Check the 4 digits with the customer and try again." };
    if (m.includes("NOT_READY")) return { error: "This order isn't ready for handover yet." };
    if (m.includes("not authorized")) return { error: "You can't close orders for this branch." };
    return { error: m };
  }
  revalidatePath(`/vendor/orders/${order_id}`);
  revalidatePath("/vendor/queue");
  return { ok: true };
}

/** Mark an order out for delivery. */
export async function markOutForDelivery(order_id: string) {
  return pressStage(order_id, "out_for_delivery");
}

/** Assign a rider to an order (own rider or a dispatch driver). They're given the code. */
/**
 * Put a rider on an order: a saved one (contactId), or a name + phone typed
 * on the spot — saved to the rider list when `save` (the DB reuses a contact
 * with the same number). Empty name + phone clears the rider. 0045.
 */
export async function assignRider(order_id: string, rider: {
  contactId?: string | null; name?: string; phone?: string; kind?: "own" | "dispatch"; company?: string; save?: boolean;
}) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("assign_order_rider", {
    p_order: order_id, p_contact: rider.contactId ?? null,
    p_name: rider.name ?? "", p_phone: rider.phone ?? "",
    p_kind: rider.kind ?? "own", p_company: rider.company ?? null, p_save: rider.save ?? true,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*(?=[A-Z])/, "") };
  revalidatePath(`/vendor/orders/${order_id}`);
  revalidatePath("/vendor/dispatch");
  return { ok: true };
}

/** Log the dispatch-partner booking reference (booking happens outside the app). */
export async function logDispatch(order_id: string, reference: string) {
  const supabase = createClient();
  const { error } = await supabase.from("orders")
    .update({ dispatch_reference: reference.trim() || null } as never).eq("id", order_id);
  if (error) return { error: error.message };
  revalidatePath(`/vendor/orders/${order_id}`);
  return { ok: true };
}

/**
 * Record a failed delivery and reset the order to ready for another attempt.
 * customerFault = true applies the non-collection penalty (% of the delivery
 * fee); a missing item / our error applies no penalty. Delegates to the DB
 * function so the penalty and total are computed and logged atomically.
 */
export async function rescheduleDelivery(order_id: string, customerFault: boolean) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("apply_delivery_reschedule", {
    p_order: order_id,
    p_customer_fault: customerFault,
  });
  if (error) return { error: error.message };
  revalidatePath(`/vendor/orders/${order_id}`);
  return { ok: true };
}

/** Create a vendor-funded promo (manager only; the discount comes out of the vendor's pay). */
export async function createVendorPromo(formData: FormData) {
  const supabase = createClient();
  const vendor_id = String(formData.get("vendor_id"));
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const discount_type = String(formData.get("discount_type") || "percent");
  const value = Number(formData.get("value") || 0);
  const max_discount = formData.get("max_discount") ? Number(formData.get("max_discount")) : null;
  const usage_limit = formData.get("usage_limit") ? Number(formData.get("usage_limit")) : null;
  const per_customer_limit = Number(formData.get("per_customer_limit") || 1);
  const expires_at = String(formData.get("expires_at") || "") || null;
  if (!code) return { error: "Enter a code." };
  if (!(value > 0)) return { error: "Enter a discount value." };

  const { error } = await supabase.from("promo_codes").insert({
    code, discount_type, value, max_discount, usage_limit, per_customer_limit, expires_at,
    vendor_id, active: true,
  } as never);
  if (error) return { error: error.code === "23505" ? "That code already exists." : error.message };
  revalidatePath("/vendor/promos");
  return { ok: true };
}

export async function toggleVendorPromo(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("promo_codes").update({ active } as never).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/vendor/promos");
  return { ok: true };
}

/**
 * Record an uploaded verification document (ID or CAC certificate). The file
 * itself is uploaded to the vendor-docs bucket from the browser; this stores
 * the row. Verification happens after onboarding, so it never blocks ordering.
 */
export async function uploadVendorDoc(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const vendor_id = String(formData.get("vendor_id"));
  const type = String(formData.get("type")); // 'id' | 'cac' | 'other'
  const file_path = String(formData.get("file_path") || "");
  const original_name = String(formData.get("original_name") || "") || null;
  if (!file_path) return { error: "No file uploaded." };

  const { error } = await supabase.from("vendor_documents").insert({
    vendor_id, type, file_path, original_name, uploaded_by: user?.id,
  } as never);
  if (error) return { error: error.message };
  revalidatePath("/vendor/verification");
  return { ok: true };
}

/**
 * Resolve a bank account name via Paystack (so the vendor confirms the account
 * before saving). Needs PAYSTACK_SECRET_KEY on the server; without it, the
 * vendor can still type the name manually.
 */
export async function resolveBankAccount(accountNumber: string, bankCode: string) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return { error: "Account verification isn't configured yet — type the name as it appears on the account." };
  const acct = accountNumber.trim();
  if (!/^\d{10}$/.test(acct)) return { error: "Enter a valid 10-digit account number." };
  try {
    const res = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${acct}&bank_code=${bankCode}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const body = await res.json();
    if (!res.ok || !body.status) return { error: body.message || "Could not verify that account." };
    return { ok: true, account_name: body.data?.account_name as string };
  } catch {
    return { error: "Could not reach the bank verification service." };
  }
}

/** Save (or replace) the vendor's payout bank account. Transfers pay into this. */
export async function saveVendorPayoutAccount(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const vendor_id = String(formData.get("vendor_id"));
  const bank_code = String(formData.get("bank_code") || "");
  const bank_name = String(formData.get("bank_name") || "") || null;
  const account_number = String(formData.get("account_number") || "").trim();
  const account_name = String(formData.get("account_name") || "").trim() || null;
  if (!bank_code) return { error: "Choose a bank." };
  if (!/^\d{10}$/.test(account_number)) return { error: "Enter a valid 10-digit account number." };

  // Changing the account invalidates any existing Paystack recipient; the
  // payout function recreates it on the next transfer.
  const { error } = await supabase.from("vendor_payout_accounts").upsert({
    vendor_id, bank_code, bank_name, account_number, account_name,
    recipient_code: null, created_by: user?.id, updated_at: new Date().toISOString(),
  } as never, { onConflict: "vendor_id" });
  if (error) return { error: error.message };
  revalidatePath("/vendor/ledger");
  return { ok: true };
}

/** Vendor manager accepts the current Partner Agreement. */
export async function acceptVendorTerms(vendor_id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("vendors")
    .update({ terms_accepted_at: new Date().toISOString() } as never).eq("id", vendor_id);
  if (error) return { error: error.message };
  revalidatePath("/vendor/verification");
  return { ok: true };
}

/** Record a vendor expense in the ledger (manager only, enforced by RLS). */
export async function addExpense(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const vendor_id = String(formData.get("vendor_id"));
  const amount = Number(formData.get("amount") || 0);
  const reason = String(formData.get("reason") || "").trim() || null;
  const receipt_path = String(formData.get("receipt_path") || "") || null;
  if (!(amount > 0)) return { error: "Enter an amount." };

  const { error } = await supabase.from("ledger_entries").insert({
    vendor_id, type: "expense", amount, reason, receipt_path, created_by: user?.id,
  } as never);
  if (error) return { error: error.message };
  revalidatePath("/vendor/ledger");
  return { ok: true };
}

/** Confirm pickup from the customer with the one-time PIN. */
export async function confirmPickup(order_id: string, code: string) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("confirm_pickup", { p_order: order_id, p_code: code });
  if (error) return { error: error.message.includes("pin does not match") ? "That PIN doesn't match." : error.message };
  revalidatePath(`/vendor/orders/${order_id}`);
  return { ok: true };
}

/** Attendant requests a new item type; a manager approves it. */
export async function requestItemType(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const vendor_id = String(formData.get("vendor_id"));
  const item_name = String(formData.get("item_name") || "").trim();
  const price = formData.get("price") ? Number(formData.get("price")) : null;
  if (!item_name) return { error: "Enter an item name." };

  const { error } = await supabase.from("item_type_requests").insert({
    vendor_id, requested_by: user!.id, item_name, price,
  } as never);
  if (error) return { error: error.message };
  revalidatePath("/vendor/requests");
  return { ok: true };
}

/** Manager decision on an item-type request. On approve, add it to the catalogue. */
export async function decideItemType(id: string, approve: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: req } = await supabase
    .from("item_type_requests").select("*").eq("id", id).single();
  if (!req) return { error: "Request not found." };

  if (approve) {
    const { data: it } = await supabase.from("item_types")
      .insert({ name: req.item_name, is_global: false, vendor_id: req.vendor_id } as never)
      .select("id").single();
    if (it && req.price) {
      await supabase.from("price_list").insert({
        vendor_id: req.vendor_id, item_type_id: it.id, service: "wash_and_fold", price: req.price,
      } as never);
    }
  }

  const { error } = await supabase.from("item_type_requests")
    .update({ status: approve ? "approved" : "rejected", approved_by: user!.id, decided_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/vendor/requests");
  return { ok: true };
}

// ─── Orders entered by the vendor (walk-in / phone customers) ───────────────

export type FoundCustomer = { id: string; full_name: string; phone: string | null; email_hint: string | null };

/** Look a customer up by exact phone or email (vendor staff only — enforced in the DB). */
export async function findCustomer(query: string): Promise<{ results?: FoundCustomer[]; error?: string }> {
  const q = query.trim();
  if (q.replace(/\D/g, "").length < 10 && !q.includes("@")) {
    return { error: "Enter the customer's full phone number or email." };
  }
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("find_customer_for_vendor", { p_query: q });
  if (error) return { error: error.message };
  return { results: (data ?? []) as FoundCustomer[] };
}

/** Nigerian local or international number → E.164 (+234…). */
function toE164(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = "234" + d.slice(1);
  return d.length >= 10 ? `+${d}` : null;
}

/**
 * Create a customer account for a walk-in (vendor staff only). With an email,
 * the customer is invited to set a password (Supabase "Invite user" email);
 * with only a phone, the account is created for them to claim later.
 */
async function createWalkInCustomer(full_name: string, phoneRaw: string, emailRaw: string) {
  const service = createServiceClient();
  if (!service) return { error: "Adding new customers needs SUPABASE_SERVICE_ROLE_KEY on the server." };
  const phone = toE164(phoneRaw);
  if (!phone) return { error: "Enter a valid phone number." };
  const email = emailRaw.trim().toLowerCase();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email, or leave it blank." };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const meta = { full_name, phone };
  const { data, error } = email
    ? await service.auth.admin.inviteUserByEmail(email, {
        data: meta, redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
      })
    : await service.auth.admin.createUser({ phone, user_metadata: meta });
  if (error) {
    return { error: /already|registered|exists/i.test(error.message)
      ? "That email or phone already has an account — search for it instead."
      : error.message };
  }
  return { id: data.user.id as string };
}

/** Vendor staff create an order for a customer (found or newly added). */
export async function createVendorOrder(_prev: unknown, formData: FormData) {
  const ctx = await getVendorContext();
  const supabase = createClient();

  let customer_id = String(formData.get("customer_id") || "");
  if (!customer_id) {
    const full_name = String(formData.get("new_name") || "").trim();
    const phone = String(formData.get("new_phone") || "").trim();
    if (!full_name || !phone) return { error: "Find the customer, or enter a name and phone to add them." };
    const created = await createWalkInCustomer(full_name, phone, String(formData.get("new_email") || ""));
    if ("error" in created) return { error: created.error };
    customer_id = created.id;
  } else {
    // Only customer accounts can own orders.
    const service = createServiceClient();
    if (service) {
      const { data: p } = await service.from("profiles").select("role").eq("id", customer_id).maybeSingle();
      if (p?.role !== "customer") return { error: "That account isn't a customer." };
    }
  }

  const entry_mode = String(formData.get("entry_mode") || "drop_off") as EntryMode;
  const return_mode = String(formData.get("return_mode") || "collection") as ReturnMode;
  const payment_timing = String(formData.get("payment_timing") || "on_delivery") as PaymentTiming;
  const service_tier = String(formData.get("service_tier") || "standard") as ServiceTier;
  const turnaround = String(formData.get("turnaround") || "normal") as Turnaround;
  const delivered_by = (String(formData.get("delivered_by") || "") || null) as DeliveredBy | null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const extraIds = formData.getAll("extras").map(String).filter(Boolean);

  // Branch: the one picked (business-wide staff), else the staff member's own (set by the DB).
  const branchChoice = String(formData.get("branch_id") || "");
  const branch = branchChoice ? ctx.branches.find((b) => b.id === branchChoice && b.active) : undefined;
  if (branchChoice && !branch) return { error: "Choose one of your branches." };
  const branchId = branch?.id ?? ctx.branchId ?? ctx.branches.find((b) => b.is_main)?.id ?? null;

  // The customer's address, for a pickup or a delivery — saved to their account.
  let addressId: string | null = null;
  let address: { line1: string; area: string | null; city: string | null; lat: number | null; lng: number | null } | null = null;
  if (entry_mode === "pickup" || return_mode === "delivery") {
    const line1 = String(formData.get("address_line1") || "").trim();
    const area = String(formData.get("address_area") || "").trim() || null;
    const city = String(formData.get("address_city") || "").trim() || null;
    if (!line1) return { error: "Enter the customer's address for the pickup or delivery." };
    const at = mapsConfigured() ? await geocode(addressText({ line1, area, city })) : null;
    address = { line1, area, city, lat: at?.lat ?? null, lng: at?.lng ?? null };
    // Staff can't write customers' addresses under RLS; the service client does, for this customer only.
    const service = createServiceClient();
    if (service) {
      const { data: saved } = await service.from("customer_addresses")
        .insert({ customer_id, label: "Address", ...address }).select("id").single();
      addressId = saved?.id ?? null;
    }
  }

  // Trip fees: pickup and/or delivery each cost a trip — flat, or by Google
  // Maps distance from the branch to the customer's address (same address, so
  // same fee for each leg).
  let delivery_fee = 0;
  let pickup_fee = 0;
  let distanceKm: number | null = null;
  let pickupKm: number | null = null;
  if (return_mode === "delivery" || entry_mode === "pickup") {
    let from = null;
    if (branchId) {
      const { data: b } = await supabase.from("branches")
        .select("lat, lng, address_line, area, city").eq("id", branchId).maybeSingle();
      from = b ?? null;
    }
    const q = await quoteDelivery(await loadPricing(supabase), from, address);
    if (return_mode === "delivery") { delivery_fee = q.fee; distanceKm = q.km; }
    if (entry_mode === "pickup")    { pickup_fee = q.fee; pickupKm = q.km; }
  }

  const { data, error } = await supabase
    .from("orders")
    .insert({
      customer_id,
      vendor_id: ctx.vendorId,
      ...(branchId ? { branch_id: branchId } : {}),
      ...(addressId ? { pickup_address_id: addressId } : {}),
      ...(distanceKm != null ? { delivery_distance_km: distanceKm } : {}),
      ...(pickupKm != null ? { pickup_distance_km: pickupKm } : {}),
      entry_mode,
      return_mode,
      delivered_by: return_mode === "delivery" ? (delivered_by ?? "own_rider") : null,
      payment_timing,
      service_tier,
      turnaround,
      delivery_fee,
      pickup_fee,
      total: delivery_fee + pickup_fee, // items/extras/markups recompute via triggers
      notes,
      status: entry_mode === "pickup" ? "pickup_requested" : "awaiting_dropoff",
    } as never)
    .select("id")
    .single();
  if (error) return { error: error.message };
  const orderId = (data as { id: string }).id;

  if (service_tier === "premium" && extraIds.length > 0) {
    const { data: extras } = await supabase
      .from("service_extras").select("id, name, price").in("id", extraIds).eq("active", true);
    const rows = (extras ?? []).map((e) => ({ order_id: orderId, extra_id: e.id, name: e.name, price: e.price }));
    if (rows.length > 0) await supabase.from("order_extras").insert(rows as never);
  }

  // Customer gets "Order confirmed"; admins get "New order". The vendor's own
  // staff entered it, so they're skipped.
  await Promise.all([
    notifyOrder("order_confirmed", orderId),
    notifyOrder("order_placed", orderId, { skip: ["vendor"] }),
  ]);

  revalidatePath("/vendor/queue");
  redirect(`/vendor/orders/${orderId}`);
}

/** The main manager replies to laundriroom's inquiry or warning about reviews. */
export async function respondQualityAction(actionId: string, response: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("respond_quality_action" as never, { p_action: actionId, p_response: response } as never);
  if (error) return { error: error.message };
  revalidatePath("/vendor/reviews");
  revalidatePath("/admin/quality");
  return { ok: true };
}
