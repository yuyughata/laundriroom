import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Always read fresh; never cache the status probe.
export const dynamic = "force-dynamic";

/**
 * Lightweight live-status probe for the customer order page. Returns a small
 * signature of the fields that page shows (status, number of stage events,
 * number of items, whether it's paid). The OrderLive client polls this and
 * reloads the page when the signature changes. Runs with the caller's session,
 * so RLS limits it to an order the caller may see; anyone else gets sig: null.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const headers = { "Cache-Control": "no-store" };

  const { data: order } = await supabase
    .from("orders").select("status").eq("id", params.id).maybeSingle();
  if (!order) return NextResponse.json({ sig: null }, { headers });

  const [stages, items, paid] = await Promise.all([
    supabase.from("stage_events").select("id", { count: "exact", head: true }).eq("order_id", params.id),
    supabase.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", params.id),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("order_id", params.id).eq("status", "succeeded"),
  ]);

  const status = (order as { status: string }).status;
  const sig = `${status}|${stages.count ?? 0}|${items.count ?? 0}|${(paid.count ?? 0) > 0 ? 1 : 0}`;
  return NextResponse.json({ sig }, { headers });
}
