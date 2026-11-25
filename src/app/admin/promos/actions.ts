"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parsePromoFields } from "@/lib/promoForm";

export async function createPromo(formData: FormData) {
  const supabase = createClient();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const usage_limit = formData.get("usage_limit") ? Number(formData.get("usage_limit")) : null;
  const per_customer_limit = Number(formData.get("per_customer_limit") || 1);
  const expires_at = String(formData.get("expires_at") || "") || null;
  if (!code) return { error: "Enter a code." };
  const core = parsePromoFields(formData);
  if ("error" in core) return core;

  const { error } = await supabase.from("promo_codes").insert({
    code, ...core, usage_limit, per_customer_limit, expires_at, active: true,
  } as never);
  if (error) return { error: error.code === "23505" ? "That code already exists." : error.message };
  revalidatePath("/admin/promos");
  return { ok: true };
}

export async function togglePromo(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("promo_codes").update({ active } as never).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/promos");
  return { ok: true };
}

export async function updatePromo(id: string, formData: FormData) {
  const supabase = createClient();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const usage_limit = formData.get("usage_limit") ? Number(formData.get("usage_limit")) : null;
  const per_customer_limit = Number(formData.get("per_customer_limit") || 1);
  const expires_at = String(formData.get("expires_at") || "") || null;
  if (!code) return { error: "Enter a code." };
  const core = parsePromoFields(formData);
  if ("error" in core) return core;

  const { error } = await supabase.from("promo_codes").update({
    code, ...core, usage_limit, per_customer_limit, expires_at,
  } as never).eq("id", id);
  if (error) return { error: error.code === "23505" ? "That code already exists." : error.message };
  revalidatePath("/admin/promos");
  return { ok: true };
}

export async function deletePromo(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("promo_codes").delete().eq("id", id);
  if (error) {
    return { error: error.code === "23503"
      ? "This code is linked to a referral reward and can't be deleted — switch it off instead."
      : error.message };
  }
  revalidatePath("/admin/promos");
  return { ok: true };
}
