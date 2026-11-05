"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setNewsletterOptOut(optOut: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.from("profiles").update({ newsletter_opt_out: optOut } as never).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/customer/account");
  return { ok: true };
}
