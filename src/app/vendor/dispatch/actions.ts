"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getVendorContext } from "@/lib/vendor";
import { phoneKey } from "@/lib/phone";

export type RiderInput = { name: string; phone: string; kind: "own" | "dispatch"; company?: string; notes?: string; branchId?: string | null };

function check(r: RiderInput) {
  if (!r.name?.trim()) return "Enter the rider's name.";
  if (phoneKey(r.phone).length < 7) return "Enter the rider's phone number.";
  if (r.kind !== "own" && r.kind !== "dispatch") return "Choose own rider or dispatch.";
  return null;
}
const friendly = (m: string) => /rider_contacts_vendor_phone_key|duplicate key/.test(m)
  ? "That phone number is already on your Dispatch list." : m;

/** Add a rider to the list (any staff). Branch-only staff add riders for their branch. */
export async function addRider(r: RiderInput) {
  const ctx = await getVendorContext();
  const problem = check(r); if (problem) return { error: problem };
  const supabase = createClient();
  const branch_id = ctx.branchId ?? (r.branchId || null);
  const { error } = await supabase.from("rider_contacts").insert({
    vendor_id: ctx.vendorId, branch_id, name: r.name, phone: r.phone, kind: r.kind,
    company: r.kind === "dispatch" ? (r.company || null) : null, notes: r.notes || null,
  } as never);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/vendor/dispatch");
  return { ok: true };
}

/** Edit a rider (managers; enforced by the database). */
export async function updateRider(id: string, r: RiderInput) {
  const ctx = await getVendorContext();
  const problem = check(r); if (problem) return { error: problem };
  const supabase = createClient();
  const patch: Record<string, unknown> = {
    name: r.name, phone: r.phone, kind: r.kind,
    company: r.kind === "dispatch" ? (r.company || null) : null, notes: r.notes || null,
  };
  if (ctx.isManager) patch.branch_id = r.branchId || null; // only business-wide managers move riders between branches
  const { data, error } = await supabase.from("rider_contacts").update(patch as never).eq("id", id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "Only a manager can edit riders." };
  revalidatePath("/vendor/dispatch");
  return { ok: true };
}

/** Archive or bring back a rider (managers). Archived riders aren't offered on orders. */
export async function setRiderActive(id: string, active: boolean) {
  await getVendorContext();
  const supabase = createClient();
  const { data, error } = await supabase.from("rider_contacts").update({ active } as never).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only a manager can archive riders." };
  revalidatePath("/vendor/dispatch");
  return { ok: true };
}
