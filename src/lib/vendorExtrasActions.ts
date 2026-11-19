"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

/**
 * Per-vendor premium extras (0060), managed by a business-wide vendor manager
 * at Vendor → Items → Premium extras. Each extra is a flat ₦ price or a
 * percentage of the order's items subtotal (resolved after check-in). The
 * database (service_extras RLS) is the real guard; these checks give clear
 * messages and pin writes to the caller's own vendor.
 */

type Result = { ok: true } | { error: string };

/** The vendor the signed-in user is a business-wide manager of, or an error. */
async function managerVendorId(): Promise<{ vendorId: string } | { error: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Please sign in again." };
  if (profile.role !== "vendor_manager") return { error: "Only a business-wide manager can manage premium extras." };
  const supabase = createClient();
  const { data } = await supabase.from("vendor_memberships" as never)
    .select("vendor_id, branch_id").eq("profile_id", profile.id).limit(1).maybeSingle();
  const m = data as { vendor_id: string; branch_id: string | null } | null;
  if (!m || m.branch_id) return { error: "Only the business's main manager can manage premium extras." };
  return { vendorId: m.vendor_id };
}

type ExtraFields = {
  name: string; description: string | null;
  price_type: "fixed" | "percent"; price: number; percent: number;
};

function readExtra(fd: FormData): { error: string } | { fields: ExtraFields } {
  const name = String(fd.get("name") || "").trim();
  const description = String(fd.get("description") || "").trim() || null;
  const priceType = String(fd.get("price_type") || "fixed") === "percent" ? "percent" : "fixed";
  const percent = Math.max(0, Math.min(100, Number(fd.get("percent") || 0)));
  const price = Math.max(0, Number(fd.get("price") || 0));
  if (!name) return { error: "Enter a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  if (priceType === "percent" && !(percent > 0)) return { error: "Enter a percentage greater than 0." };
  if (priceType === "fixed" && !(price > 0)) return { error: "Enter a price greater than 0." };
  return {
    fields: {
      name, description, price_type: priceType,
      price: priceType === "fixed" ? price : 0,
      percent: priceType === "percent" ? percent : 0,
    },
  };
}

export async function saveVendorExtra(formData: FormData): Promise<Result> {
  const who = await managerVendorId();
  if ("error" in who) return who;
  const parsed = readExtra(formData);
  if ("error" in parsed) return { error: parsed.error };
  const fields = parsed.fields;

  const supabase = createClient();
  const id = String(formData.get("id") || "");
  const { error } = id
    ? await supabase.from("service_extras").update(fields as never).eq("id", id).eq("vendor_id", who.vendorId)
    : await supabase.from("service_extras").insert({ ...fields, active: true, vendor_id: who.vendorId } as never);
  if (error) return { error: error.message };
  revalidatePath("/vendor/items");
  return { ok: true };
}

export async function toggleVendorExtra(id: string, active: boolean): Promise<Result> {
  const who = await managerVendorId();
  if ("error" in who) return who;
  const supabase = createClient();
  const { error } = await supabase.from("service_extras")
    .update({ active } as never).eq("id", id).eq("vendor_id", who.vendorId);
  if (error) return { error: error.message };
  revalidatePath("/vendor/items");
  return { ok: true };
}

export async function deleteVendorExtra(id: string): Promise<Result> {
  const who = await managerVendorId();
  if ("error" in who) return who;
  const supabase = createClient();
  const { error } = await supabase.from("service_extras")
    .delete().eq("id", id).eq("vendor_id", who.vendorId);
  if (error) return { error: error.message };
  revalidatePath("/vendor/items");
  return { ok: true };
}
