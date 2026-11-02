"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/** Approve or reject an uploaded vendor document. */
export async function reviewVendorDoc(id: string, approve: boolean, note?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("vendor_documents").update({
    status: approve ? "approved" : "rejected",
    note: note?.trim() || null,
    reviewed_by: user?.id,
  } as never).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/verification");
  return { ok: true };
}

/** Flip a vendor's KYC-verified flag. */
export async function setVendorKyc(vendorId: string, verified: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("vendors")
    .update({ kyc_verified: verified } as never).eq("id", vendorId);
  if (error) return { error: error.message };
  revalidatePath("/admin/verification");
  revalidatePath("/admin/vendors");
  return { ok: true };
}
