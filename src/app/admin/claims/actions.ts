"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ClaimStatus } from "@/lib/database.types";

/** Resolve or update a claim (admin/support). Records a resolution + compensation. */
export async function resolveClaim(id: string, status: ClaimStatus, compensation: number, note: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "platform_admin" && me?.role !== "support_agent") return { error: "Support staff only." };

  const { error } = await supabase.from("claims").update({
    status, compensation: compensation || 0, resolution_note: note.trim() || null, resolved_by: user.id,
  } as never).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/claims/${id}`);
  revalidatePath("/admin/claims");
  return { ok: true };
}
