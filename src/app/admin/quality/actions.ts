"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { notifyVendorAction } from "@/lib/notify";

export type QualityStage = "inquiry" | "warning" | "suspension" | "resolved";

/** The steps in order. An admin can't skip one (warning needs an inquiry first, …). */
const ORDER: Exclude<QualityStage, "resolved">[] = ["inquiry", "warning", "suspension"];

/** The current case: steps since the last "resolved". */
async function openCase(supabase: ReturnType<typeof createClient>, vendorId: string) {
  const { data } = await supabase.from("vendor_quality_actions" as never)
    .select("stage, created_at").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(20);
  const rows = (data ?? []) as { stage: QualityStage }[];
  const open: QualityStage[] = [];
  for (const r of rows) { if (r.stage === "resolved") break; open.push(r.stage); }
  return open; // newest first
}

/**
 * Take the next escalation step on a vendor with bad reviews: inquiry →
 * warning → suspension. Each step messages the vendor's main manager(s);
 * suspension also suspends the vendor. Platform admins only.
 */
export async function takeQualityAction(vendorId: string, stage: QualityStage, message: string) {
  await requireRole(["platform_admin"]);
  const text = message.trim();
  if (stage !== "resolved" && text.length < 10) return { error: "Write a short message to the vendor (10+ characters)." };
  const supabase = createClient();
  const open = await openCase(supabase, vendorId);
  const current = open[0] as QualityStage | undefined;

  if (stage === "resolved") {
    if (!current) return { error: "There's no open case to resolve." };
  } else {
    const want = ORDER.indexOf(stage);
    const have = current ? ORDER.indexOf(current as Exclude<QualityStage, "resolved">) : -1;
    if (want !== have + 1) {
      const next = ORDER[have + 1];
      return { error: next ? `The next step for this vendor is: ${next}.` : "This vendor is already suspended." };
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("vendor_quality_actions" as never)
    .insert({ vendor_id: vendorId, stage, message: text || "Case resolved.", created_by: user?.id } as never)
    .select("id").single();
  if (error) return { error: /relation|does not exist/.test(error.message) ? "This needs database migration 0038." : error.message };
  const actionId = (data as { id: string }).id;

  if (stage === "suspension") {
    const { error: sErr } = await supabase.from("vendors").update({ status: "suspended" } as never).eq("id", vendorId);
    if (sErr) return { error: sErr.message };
  }
  if (stage !== "resolved") {
    await notifyVendorAction(
      stage === "inquiry" ? "vendor_inquiry" : stage === "warning" ? "vendor_warning" : "vendor_suspended", actionId);
  }

  revalidatePath("/admin/quality");
  revalidatePath("/admin/vendors");
  revalidatePath("/vendor/reviews");
  return { ok: true };
}
