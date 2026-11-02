"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Approve a vendor application: create the vendor record (default plan, pending
 * verification) and mark the application approved, linking the new vendor.
 */
export async function approveApplication(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: app } = await supabase
    .from("vendor_applications").select("*").eq("id", id).single();
  if (!app) return { error: "Application not found." };
  if (app.status !== "pending") return { error: "Already reviewed." };

  const { data: plan } = await supabase
    .from("vendor_plans").select("id").eq("is_default", true).limit(1).maybeSingle();

  const { data: vendor, error: vErr } = await supabase.from("vendors").insert({
    name: app.business_name, area: app.area, city: app.city,
    delivery: app.delivery, status: "pending", plan_id: plan?.id ?? null,
  } as never).select("id").single();
  if (vErr) return { error: vErr.message };

  const { error } = await supabase.from("vendor_applications").update({
    status: "approved", vendor_id: vendor!.id, reviewed_by: user?.id,
  } as never).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/applications");
  revalidatePath("/admin/vendors");
  return { ok: true };
}

export async function rejectApplication(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("vendor_applications").update({
    status: "rejected", reviewed_by: user?.id,
  } as never).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/applications");
  return { ok: true };
}
