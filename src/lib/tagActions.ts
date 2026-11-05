"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Tag batches (migration 0036). Generating is limited by the database to a
 * business's main manager and platform admins; any of the vendor's staff can
 * mark a tag missing / damaged / found.
 */

function refresh() {
  revalidatePath("/vendor/tags");
  revalidatePath("/admin/tags");
}

export async function generateTagBatch(vendorId: string, count: number) {
  const n = Math.round(Number(count));
  if (!Number.isFinite(n) || n < 1 || n > 500) return { error: "Generate between 1 and 500 tags at a time." };
  const supabase = createClient();
  const { data, error } = await supabase.rpc("generate_tags" as never,
    { p_vendor: vendorId, p_count: n } as never);
  if (error) {
    return { error: /function .* does not exist|generate_tags/.test(error.message) && /exist/.test(error.message)
      ? "Tag batches need database migration 0036." : error.message };
  }
  refresh();
  return { ok: true as const, batchId: data as unknown as string };
}

export async function setTagStatus(tagId: string, status: "missing" | "damaged" | "found" | "retired", note?: string) {
  const supabase = createClient();
  const { data: t } = await supabase.from("tags").select("id, status, current_item_id").eq("id", tagId).maybeSingle();
  if (!t) return { error: "Tag not found." };
  const tag = t as { status: string; current_item_id: string | null };
  const next = status === "found" ? (tag.current_item_id ? "in_use" : "free") : status;
  const { error } = await supabase.from("tags").update({
    status: next,
    status_note: status === "found" ? "Found" : (note?.trim() || null),
    status_changed_at: new Date().toISOString(),
  } as never).eq("id", tagId);
  if (error) return { error: error.message };
  refresh();
  return { ok: true as const };
}

type FoundTag = {
  id: string; code: string; status: string; serial: number | null; print_count: number;
  last_printed_at: string | null; status_note: string | null; current_item_id: string | null; batch_id: string | null;
};

/**
 * Find a vendor's tags by code: a full code ("FPL-0042"), part of one, or
 * just the number ("42"). Exact and same-number matches come first.
 */
export async function searchTags(vendorId: string, query: string): Promise<{ tags: FoundTag[] } | { error: string }> {
  const q = query.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!q) return { tags: [] };
  const supabase = createClient();
  const { data, error } = await supabase.from("tags")
    .select("id, code, status, serial, print_count, last_printed_at, status_note, current_item_id, batch_id")
    .eq("vendor_id", vendorId).ilike("code", `%${q}%`).order("code").limit(25);
  if (error) return { error: error.message };
  const num = /^\d+$/.test(q) ? Number(q) : null;
  const rank = (t: FoundTag) => (t.code === q ? 0 : num !== null && t.serial === num ? 1 : 2);
  return { tags: ((data ?? []) as FoundTag[]).sort((a, b) => rank(a) - rank(b)) };
}
