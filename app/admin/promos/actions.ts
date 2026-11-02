"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPromo(formData: FormData) {
  const supabase = createClient();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const discount_type = String(formData.get("discount_type") || "percent");
  const value = Number(formData.get("value") || 0);
  const max_discount = formData.get("max_discount") ? Number(formData.get("max_discount")) : null;
  const min_order = Number(formData.get("min_order") || 0);
  const usage_limit = formData.get("usage_limit") ? Number(formData.get("usage_limit")) : null;
  const per_customer_limit = Number(formData.get("per_customer_limit") || 1);
  const expires_at = String(formData.get("expires_at") || "") || null;

  if (!code) return { error: "Enter a code." };
  if (!(value > 0)) return { error: "Enter a discount value." };

  const { error } = await supabase.from("promo_codes").insert({
    code, discount_type, value, max_discount, min_order, usage_limit, per_customer_limit,
    expires_at, active: true,
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
