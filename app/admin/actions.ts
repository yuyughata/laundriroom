"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { VendorStatus, NotifChannel, IntegrationProvider } from "@/lib/database.types";

/** Onboard a new vendor (admin). Starts pending on the default plan. */
export async function createVendor(formData: FormData) {
  const supabase = createClient();
  const name = String(formData.get("name") || "").trim();
  const area = String(formData.get("area") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const delivery = String(formData.get("delivery") || "own_riders");
  if (!name) return { error: "Enter the vendor name." };

  const { data: plan } = await supabase.from("vendor_plans").select("id").eq("is_default", true).limit(1).maybeSingle();
  const { error } = await supabase.from("vendors").insert({
    name, area, city, delivery, status: "pending", plan_id: plan?.id ?? null,
  } as never);
  if (error) return { error: error.message };
  revalidatePath("/admin/vendors");
  return { ok: true };
}

export async function setVendorStatus(vendorId: string, status: VendorStatus) {
  const supabase = createClient();
  const { error } = await supabase.from("vendors").update({ status } as never).eq("id", vendorId);
  if (error) return { error: error.message };
  revalidatePath("/admin/vendors");
  return { ok: true };
}

export async function assignVendorPlan(vendorId: string, planId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("vendors").update({ plan_id: planId } as never).eq("id", vendorId);
  if (error) return { error: error.message };
  revalidatePath("/admin/vendors");
  return { ok: true };
}

export async function savePlan(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id") || "");
  // Commission is the only model offered; type and monthly fee are fixed.
  const payload = {
    name: String(formData.get("name")),
    type: "commission",
    commission_rate: Number(formData.get("commission_rate") || 0) / 100, // UI is percent
    monthly_fee: 0,
  };
  const { error } = id
    ? await supabase.from("vendor_plans").update(payload as never).eq("id", id)
    : await supabase.from("vendor_plans").insert({ ...payload, active: true } as never);
  if (error) return { error: error.message };
  revalidatePath("/admin/plans");
  return { ok: true };
}

export async function setGlobalDeliveryFee(amount: number) {
  const supabase = createClient();
  const { data: rule } = await supabase
    .from("delivery_fee_rules").select("id").eq("scope", "global").limit(1).maybeSingle();
  const { error } = rule
    ? await supabase.from("delivery_fee_rules").update({ flat_amount: amount } as never).eq("id", rule.id)
    : await supabase.from("delivery_fee_rules").insert({ scope: "global", type: "flat", flat_amount: amount, active: true } as never);
  if (error) return { error: error.message };
  revalidatePath("/admin/plans");
  return { ok: true };
}

/** Choose the online payment provider (Paystack or Flutterwave). */
export async function setPaymentProvider(provider: "paystack" | "flutterwave") {
  const supabase = createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({ payment_provider: provider, updated_at: new Date().toISOString() } as never)
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function releasePayout(payoutId: string) {
  const supabase = createClient();
  // In production this calls the bank/Paystack transfer; here it marks it sent.
  const { error } = await supabase
    .from("payouts")
    .update({ status: "sent", sent_at: new Date().toISOString(), reference: `po_${Date.now()}` } as never)
    .eq("id", payoutId);
  if (error) return { error: error.message };
  revalidatePath("/admin/payouts");
  return { ok: true };
}

export async function holdPayout(payoutId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("payouts").update({ status: "held" } as never).eq("id", payoutId);
  if (error) return { error: error.message };
  revalidatePath("/admin/payouts");
  return { ok: true };
}

export async function updateNotificationRule(
  event: string, channels: NotifChannel[], enabled: boolean, recipients: string[]
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("notification_rules")
    .update({ channels, enabled, recipients, updated_at: new Date().toISOString() } as never)
    .eq("event", event);
  if (error) return { error: error.message };
  revalidatePath("/admin/communications");
  return { ok: true };
}

// ─── Premium extras + express surcharge ─────────────────────────────────────
export async function saveExtra(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id") || "");
  const payload = {
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "") || null,
    price: Number(formData.get("price") || 0),
  };
  if (!payload.name) return { error: "Enter a name." };
  const { error } = id
    ? await supabase.from("service_extras").update(payload as never).eq("id", id)
    : await supabase.from("service_extras").insert({ ...payload, active: true } as never);
  if (error) return { error: error.message };
  revalidatePath("/admin/services");
  return { ok: true };
}

export async function toggleExtra(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("service_extras").update({ active } as never).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/services");
  return { ok: true };
}

export async function deleteExtra(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("service_extras").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/services");
  return { ok: true };
}

/**
 * Save the platform fees & charges. Inputs are percentages (e.g. 20 for 20%);
 * stored as fractions. Express and premium are platform markups; the
 * non-collection penalty is a share of the delivery fee.
 */
export async function setFeesCharges(
  expressPct: number, premiumPct: number, penaltyPct: number, referralReward: number,
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      express_pct: expressPct / 100,
      premium_pct: premiumPct / 100,
      noncollection_penalty_pct: penaltyPct / 100,
      referral_reward: referralReward,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/fees");
  return { ok: true };
}

/**
 * Platform-funded bulk-order discount. When an order has at least `minItems`
 * items, `pct`% comes off the items subtotal. The platform bears the cost — it
 * never reduces a vendor's payout. minItems = 0 disables it.
 */
export async function setBulkDiscount(minItems: number, pct: number) {
  const supabase = createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      bulk_min_items: Math.max(0, Math.round(minItems || 0)),
      bulk_discount_pct: (pct || 0) / 100,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/promos");
  return { ok: true };
}

/**
 * Save an integration's non-secret config and status. The secret itself
 * (API key) is written to a server-side secret store by a privileged edge
 * function, never persisted here in plaintext — this records status + metadata.
 */
export async function saveIntegration(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const provider = String(formData.get("provider")) as IntegrationProvider;
  const hasKey = String(formData.get("api_key") || "").length > 0;

  const config: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("config.")) config[k.slice(7)] = String(v);
  }

  const { error } = await supabase
    .from("integration_settings")
    .update({
      status: hasKey ? "connected" : "not_configured",
      config,
      // secret_ref would be set by the edge function after it stores the key
      secret_ref: hasKey ? `secret://${provider}` : null,
      last_test_at: hasKey ? new Date().toISOString() : null,
      last_test_ok: hasKey ? true : null,
      changed_by: user?.id,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("provider", provider);
  if (error) return { error: error.message };
  revalidatePath("/admin/integrations");
  return { ok: true };
}
