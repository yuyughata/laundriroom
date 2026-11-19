"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { HOMEPAGE_FIELDS } from "@/lib/homepageContent";

/**
 * Save homepage copy overrides (platform admins only; RLS enforces it too).
 * A field left at its default (or blank) is stored as no row, so the page
 * falls back to the built-in copy — keeping the table to only what changed.
 */
export async function saveHomepageContent(formData: FormData) {
  const profile = await requireRole(["platform_admin"]);
  const supabase = createClient();

  const toUpsert: { key: string; value: string; updated_by: string; updated_at: string }[] = [];
  const toDelete: string[] = [];
  const now = new Date().toISOString();

  for (const f of HOMEPAGE_FIELDS) {
    const raw = String(formData.get(f.key) ?? "").replace(/\r\n/g, "\n").trim();
    if (raw && raw !== f.default) {
      if (raw.length > 4000) return { error: `"${f.label}" is too long (4000 characters max).` };
      toUpsert.push({ key: f.key, value: raw, updated_by: profile.id, updated_at: now });
    } else {
      toDelete.push(f.key);
    }
  }

  if (toUpsert.length) {
    const { error } = await supabase.from("homepage_content" as never)
      .upsert(toUpsert as never, { onConflict: "key" } as never);
    if (error) return { error: error.message };
  }
  if (toDelete.length) {
    const { error } = await supabase.from("homepage_content" as never).delete().in("key", toDelete);
    if (error) return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/admin/homepage");
  return { ok: true };
}

/** Clear every override — the homepage reverts entirely to its built-in copy. */
export async function resetHomepageContent() {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("homepage_content" as never)
    .delete().not("key", "is", null);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  return { ok: true };
}
