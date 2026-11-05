import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { buildTagSheetPdf } from "@/lib/tagPdf";
import { tagSizeFrom } from "@/lib/tagSizes";
import type { TagStatus } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAFF = ["attendant", "vendor_manager", "rider", "platform_admin", "support_agent"];

/**
 * Printable tag sheet (PDF).
 *   ?batch=<id>                     the whole batch
 *   ?batch=<id>&only=missing,damaged  just the batch's missing/damaged tags
 *   ?ids=<id>,<id>                  chosen tags (same vendor)
 *   &size=20|25|30                  tag size in mm (square; default 25)
 *   &reprint=1                      a reprint: missing/damaged tags printed
 *                                   here go back to free (or in use)
 * Access follows the database rules: vendor staff see their own tags, admins all.
 */
export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile || !STAFF.includes(profile.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const supabase = createClient();
  const sp = req.nextUrl.searchParams;
  const batchId = sp.get("batch");
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => UUID.test(s)).slice(0, 500);
  const only = (sp.get("only") ?? "").split(",")
    .filter((s): s is TagStatus => ["missing", "damaged", "free", "in_use"].includes(s));
  const reprint = sp.get("reprint") === "1";
  const sizeMm = tagSizeFrom(sp.get("size"));

  let q = supabase.from("tags").select("id, code, status, vendor_id, serial, print_count, current_item_id, batch_id");
  if (batchId && UUID.test(batchId)) q = q.eq("batch_id", batchId);
  else if (ids.length) q = q.in("id", ids);
  else return NextResponse.json({ error: "Choose a batch or tags to print." }, { status: 400 });
  if (only.length) q = q.in("status", only);
  const { data, error } = await q.order("serial", { ascending: true }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  type T = { id: string; code: string; status: string; vendor_id: string; serial: number | null; print_count: number; current_item_id: string | null; batch_id: string | null };
  const tags = (data ?? []) as T[];
  if (!tags.length) return NextResponse.json({ error: "No tags to print." }, { status: 404 });
  const vendorIds = [...new Set(tags.map((t) => t.vendor_id))];
  if (vendorIds.length > 1) return NextResponse.json({ error: "Print one vendor's tags at a time." }, { status: 400 });

  const { data: v } = await supabase.from("vendors").select("name").eq("id", vendorIds[0]).maybeSingle();
  const vendorName = (v as { name?: string } | null)?.name ?? "laundriroom";
  const first = tags[0].code, last = tags[tags.length - 1].code;
  const title = `${reprint ? "Reprint" : "Tags"} ${tags.length === 1 ? first : `${first} – ${last}`} (${tags.length})`;
  const pdf = await buildTagSheetPdf(tags.map((t) => ({ code: t.code })), { vendorName, title, sizeMm });

  // Record the print. Reprinted missing/damaged tags are back in circulation.
  const now = new Date().toISOString();
  const byCount = new Map<number, string[]>();
  for (const t of tags) byCount.set(t.print_count, [...(byCount.get(t.print_count) ?? []), t.id]);
  await Promise.all([...byCount].map(([c, idList]) =>
    supabase.from("tags").update({ print_count: c + 1, last_printed_at: now } as never).in("id", idList)));
  if (reprint) {
    const back = tags.filter((t) => t.status === "missing" || t.status === "damaged");
    const inUse = back.filter((t) => t.current_item_id).map((t) => t.id);
    const free = back.filter((t) => !t.current_item_id).map((t) => t.id);
    const note = { status_note: "Reprinted", status_changed_at: now };
    if (inUse.length) await supabase.from("tags").update({ status: "in_use", ...note } as never).in("id", inUse);
    if (free.length) await supabase.from("tags").update({ status: "free", ...note } as never).in("id", free);
  }
  if (batchId && UUID.test(batchId) && !only.length) {
    const { data: b } = await supabase.from("tag_batches" as never).select("print_count").eq("id", batchId).maybeSingle();
    await supabase.from("tag_batches" as never)
      .update({ print_count: Number((b as { print_count?: number } | null)?.print_count ?? 0) + 1, last_printed_at: now } as never)
      .eq("id", batchId);
  }

  const file = `laundriroom-tags-${first}${tags.length > 1 ? `-to-${last.split("-").pop()}` : ""}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
