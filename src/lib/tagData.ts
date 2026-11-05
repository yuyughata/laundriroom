import { createClient } from "@/lib/supabase/server";
import type { TagBatch, Tag } from "@/lib/database.types";

export type BatchRow = TagBatch & {
  firstCode: string | null; lastCode: string | null;
  counts: Record<"free" | "in_use" | "missing" | "damaged" | "retired", number>;
};

export type TagOverview = {
  available: boolean;               // migration 0036 applied
  prefix: string;                   // the vendor's tag prefix (set from its name)
  nextSerial: number;
  batches: BatchRow[];
  totals: BatchRow["counts"];
};

const zero = () => ({ free: 0, in_use: 0, missing: 0, damaged: 0, retired: 0 });

/** Same rule as the database's vendor_tag_prefix_base (before the
 *  uniqueness suffix): initials, or a one-word name's first 3 letters. */
export function defaultPrefix(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w && !["and", "the", "of", "ltd", "limited", "plc", "nig", "co"].includes(w.toLowerCase()));
  const v = words.length >= 2 ? words.map((w) => w[0]).join("").slice(0, 4) : words.length === 1 ? words[0].slice(0, 3) : "LR";
  return v.padEnd(2, "X");
}

export async function loadTagOverview(vendorId: string, vendorName: string): Promise<TagOverview> {
  const supabase = createClient();
  const [{ data: v, error: vErr }, { data: batches, error: bErr }, { data: tags }] = await Promise.all([
    supabase.from("vendors").select("tag_prefix, tag_seq").eq("id", vendorId).maybeSingle(),
    supabase.from("tag_batches" as never).select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }),
    supabase.from("tags").select("batch_id, status, code, serial").eq("vendor_id", vendorId).limit(20000),
  ]);
  if (vErr || bErr) return { available: false, prefix: defaultPrefix(vendorName), nextSerial: 1, batches: [], totals: zero() };
  const vv = v as { tag_prefix: string | null; tag_seq: number } | null;
  const all = (tags ?? []) as Pick<Tag, "batch_id" | "status" | "code" | "serial">[];
  const totals = zero();
  const per = new Map<string, { counts: BatchRow["counts"]; first?: { s: number; c: string }; last?: { s: number; c: string } }>();
  for (const t of all) {
    if (t.status in totals) totals[t.status as keyof typeof totals] += 1;
    if (!t.batch_id) continue;
    const row = per.get(t.batch_id) ?? { counts: zero() };
    row.counts[t.status as keyof typeof totals] += 1;
    const s = t.serial ?? 0;
    if (!row.first || s < row.first.s) row.first = { s, c: t.code };
    if (!row.last || s > row.last.s) row.last = { s, c: t.code };
    per.set(t.batch_id, row);
  }
  return {
    available: true,
    prefix: vv?.tag_prefix ?? defaultPrefix(vendorName),
    nextSerial: (vv?.tag_seq ?? 0) + 1,
    totals,
    batches: ((batches ?? []) as TagBatch[]).map((b) => ({
      ...b,
      firstCode: per.get(b.id)?.first?.c ?? null,
      lastCode: per.get(b.id)?.last?.c ?? null,
      counts: per.get(b.id)?.counts ?? zero(),
    })),
  };
}

export async function loadBatchTags(batchId: string) {
  const supabase = createClient();
  const { data } = await supabase.from("tags")
    .select("id, code, status, serial, print_count, last_printed_at, status_note, status_changed_at, current_item_id, vendor_id")
    .eq("batch_id", batchId).order("serial");
  return (data ?? []) as Pick<Tag, "id" | "code" | "status" | "serial" | "print_count" | "last_printed_at" | "status_note" | "status_changed_at" | "current_item_id" | "vendor_id">[];
}
