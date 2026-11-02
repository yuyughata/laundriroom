"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ServiceType, StageKind } from "@/lib/database.types";

/** Attendant checks in an item: creates an order_item (price snapshot + sub-code by trigger). */
export async function checkInItem(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const order_id = String(formData.get("order_id"));
  const item_type_id = String(formData.get("item_type_id"));
  const service = String(formData.get("service")) as ServiceType;
  const customer_comment = String(formData.get("customer_comment") || "") || null;
  const condition_notes = String(formData.get("condition_notes") || "") || null;
  const tag_code = String(formData.get("tag_code") || "") || null;
  let photos: string[] = [];
  try { photos = JSON.parse(String(formData.get("photos") || "[]")); } catch { photos = []; }

  const { error } = await supabase.from("order_items").insert({
    order_id, item_type_id, service, customer_comment, condition_notes, tag_code, photos,
  } as never);
  if (error) return { error: error.message };

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

/** Close a prepaid order by confirming the handover code. */
export async function confirmHandover(order_id: string, code: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: order } = await supabase
    .from("orders").select("handover_code, payment_timing").eq("id", order_id).single();
  if (!order) return { error: "Order not found." };
  if (order.payment_timing === "online" && order.handover_code !== code) {
    return { error: "That code doesn't match." };
  }
  const { error } = await supabase
    .from("stage_events").insert({ order_id, stage: "handover", pressed_by: user?.id } as never);
  if (error) return { error: error.message };
  revalidatePath(`/vendor/orders/${order_id}`);
  return { ok: true };
}

/** Mark an order out for delivery. */
export async function markOutForDelivery(order_id: string) {
  return pressStage(order_id, "out_for_delivery");
}

/** Assign a rider to an order (own rider or a dispatch driver). They're given the code. */
export async function assignRider(order_id: string, name: string, phone: string) {
  const supabase = createClient();
  const { error } = await supabase.from("orders")
    .update({ rider_name: name.trim() || null, rider_phone: phone.trim() || null } as never)
    .eq("id", order_id);
  if (error) return { error: error.message };
  revalidatePath(`/vendor/orders/${order_id}`);
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

/** Vendor manager acknowledges the Vendor Agreement (non-circumvention). */
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
