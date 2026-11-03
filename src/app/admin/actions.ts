"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
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

export async function setGlobalDeliveryFee(amount: number) {
  const supabase = createClient();
  const { data: rule } = await supabase
    .from("delivery_fee_rules").select("id").eq("scope", "global").limit(1).maybeSingle();
  const { error } = rule
    ? await supabase.from("delivery_fee_rules").update({ flat_amount: amount } as never).eq("id", rule.id)
    : await supabase.from("delivery_fee_rules").insert({ scope: "global", type: "flat", flat_amount: amount, active: true } as never);
  if (error) return { error: error.message };
  revalidatePath("/admin/fees");
  return { ok: true };
}

/**
 * How delivery fees are worked out: the flat fee, or by Google Maps driving
 * distance (base fare + per-km rate, never below the minimum). Distance
 * pricing falls back to the flat fee whenever the distance can't be found.
 */
export async function setDeliveryPricing(input: { mode: "flat" | "distance"; perKm: number; base: number; min: number }) {
  await requireRole(["platform_admin"]);
  const nums = [input.perKm, input.base, input.min];
  if (!["flat", "distance"].includes(input.mode)) return { error: "Choose flat or distance pricing." };
  if (!nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 1_000_000)) return { error: "Amounts must be zero or more." };
  if (input.mode === "distance" && input.perKm <= 0) return { error: "Set the amount per kilometre." };
  const supabase = createClient();
  const { error } = await supabase.from("platform_settings").update({
    delivery_pricing: input.mode, delivery_per_km: input.perKm, delivery_base_fare: input.base,
    delivery_min_fee: input.min, updated_at: new Date().toISOString(),
  } as never).eq("id", true);
  if (error) return { error: /column/.test(error.message) ? "Distance pricing needs database migration 0035." : error.message };
  revalidatePath("/admin/fees");
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

/**
 * Release a payout: send the vendor's money now through Paystack (a due or
 * held payout, ignoring any hold window). Platform admins only — support
 * agents can't move money. The process-payouts edge function makes the
 * transfer; the Paystack webhook then marks it sent. Without a Paystack key,
 * local development (or ALLOW_SIMULATED_PAYMENTS=true) marks it sent as a
 * simulation, like payments do.
 */
export async function releasePayout(payoutId: string): Promise<{ ok?: true; message?: string; error?: string }> {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { data: p } = await supabase.from("payouts").select("id, status").eq("id", payoutId).maybeSingle();
  if (!p) return { error: "Payout not found." };
  const status = (p as { status: string }).status;
  if (status !== "due" && status !== "held") return { error: `This payout is already ${status}.` };

  if (!process.env.PAYSTACK_SECRET_KEY) {
    const simulate = process.env.NODE_ENV !== "production" || process.env.ALLOW_SIMULATED_PAYMENTS === "true";
    if (!simulate) return { error: "Paystack isn't set up: add PAYSTACK_SECRET_KEY to the app and the payout function." };
    const { error } = await supabase.from("payouts")
      .update({ status: "sent", sent_at: new Date().toISOString(), reference: `sim_${Date.now()}`, failure_reason: null } as never)
      .eq("id", payoutId);
    if (error) return { error: error.message };
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Simulated payout (no Paystack key on this server)." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "Payouts aren't configured on this server (SUPABASE_SERVICE_ROLE_KEY missing)." };

  const res = await fetch(`${url}/functions/v1/process-payouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
    body: JSON.stringify({ payout_id: payoutId, release: true }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  const body = res ? await res.json().catch(() => null) : null;
  revalidatePath("/admin/payouts");
  revalidatePath(`/admin/payouts/${payoutId}`);

  if (!res) return { error: "Couldn't reach the payout service. Please try again." };
  if (!res.ok) return { error: body?.error || body?.message || `Payout service error (${res.status}).` };
  const r = body?.results?.[0];
  if (r?.status === "processing") {
    return { ok: true, message: "Transfer sent to Paystack. It shows as sent once Paystack confirms it." };
  }
  if (r?.status === "sent") return { ok: true, message: "Payout settled." };
  return { error: r?.reason ? `Not sent: ${r.reason}` : "The payout wasn't sent. Check the reason on the payout." };
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

const pctOk = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;

/**
 * The platform-wide rates — one set that applies to every vendor.
 * Inputs are percentages (15 = 15%); stored as fractions. Commission lives on
 * the default plan; express and premium markups in platform_settings (the
 * platform keeps those markups in full).
 */
export async function setPlatformRates(commissionPct: number, expressPct: number, premiumPct: number) {
  if (![commissionPct, expressPct, premiumPct].every(pctOk)) return { error: "Rates must be between 0 and 100%." };
  const supabase = createClient();
  const { data: plan } = await supabase.from("vendor_plans").select("id").eq("is_default", true).limit(1).maybeSingle();
  if (!plan) return { error: "No default plan found." };
  const { error: e1 } = await supabase.from("vendor_plans")
    .update({ commission_rate: commissionPct / 100 } as never).eq("id", (plan as { id: string }).id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase.from("platform_settings")
    .update({ express_pct: expressPct / 100, premium_pct: premiumPct / 100, updated_at: new Date().toISOString() } as never)
    .eq("id", true);
  if (e2) return { error: e2.message };
  revalidatePath("/admin/fees");
  revalidatePath("/admin/vendors");
  return { ok: true };
}

/**
 * How long to hold a vendor payout after the order is completed and paid.
 * 0 (the default) pays the vendor immediately.
 */
export async function setPayoutDelay(hours: number) {
  await requireRole(["platform_admin"]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 720) return { error: "Enter a whole number of hours from 0 to 720." };
  const supabase = createClient();
  const { error } = await supabase.from("platform_settings")
    .update({ payout_delay_hours: hours, updated_at: new Date().toISOString() } as never).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/fees");
  revalidatePath("/admin/payouts");
  return { ok: true };
}

/** Non-collection penalty (% of the delivery fee) and the referral reward (₦). */
export async function setOtherCharges(penaltyPct: number, referralReward: number) {
  if (!pctOk(penaltyPct)) return { error: "Penalty must be between 0 and 100%." };
  if (!Number.isFinite(referralReward) || referralReward < 0) return { error: "Referral reward can't be negative." };
  const supabase = createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
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
