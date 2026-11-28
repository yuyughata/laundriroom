"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Homepage mailing-list capture: anyone (signed in or not) can subscribe to
 * hear about promos and deals. Email required, phone optional. A repeat email
 * is treated as success (unique on lower(email) — see migration 0063). RLS
 * lets anon insert; only platform admins can read the list.
 */
export async function subscribeMailingList(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("mailing_list" as never)
    .insert({ email, phone, source: "homepage" } as never);

  if (error) {
    // Duplicate email → already on the list, treat as success.
    if (error.code === "23505") return { ok: true };
    return { error: "Something went wrong. Please try again." };
  }
  return { ok: true };
}
