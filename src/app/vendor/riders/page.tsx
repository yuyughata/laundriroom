import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { RiderManager, type RiderRow } from "@/components/riders/RiderManager";
import type { RiderContact } from "@/lib/database.types";

/**
 * The laundry's rider list (0045): own riders and dispatch-company riders.
 * Everyone can add; managers edit and archive (a branch manager: their
 * branch's riders). Riders don't sign in — they carry the order code and PIN.
 */
export default async function VendorRiders() {
  const ctx = await getVendorContext();
  const supabase = createClient();
  const [{ data: contacts }, { data: used }] = await Promise.all([
    supabase.from("rider_contacts").select("*").eq("vendor_id", ctx.vendorId).order("active", { ascending: false }).order("name"),
    supabase.from("orders").select("rider_contact_id").eq("vendor_id", ctx.vendorId).not("rider_contact_id", "is", null).limit(5000),
  ]);
  const counts = new Map<string, number>();
  for (const o of (used ?? []) as { rider_contact_id: string }[]) counts.set(o.rider_contact_id, (counts.get(o.rider_contact_id) ?? 0) + 1);

  const isManagerRole = ctx.profile.role === "vendor_manager";
  const branchName = new Map(ctx.branches.map((b) => [b.id, b.name]));
  const rows: RiderRow[] = ((contacts ?? []) as RiderContact[]).map((c) => ({
    ...c,
    orders: counts.get(c.id) ?? 0,
    branchName: c.branch_id ? branchName.get(c.branch_id) ?? "Branch" : null,
    // mirrors can_manage_riders(): business-wide managers any rider; branch managers their branch's
    canManage: ctx.isManager || (isManagerRole && !!ctx.branchId && c.branch_id === ctx.branchId),
  }));
  const multiBranch = ctx.branches.filter((b) => b.active).length > 1;

  return (
    <VendorShell active="/vendor/riders" vendorName={ctx.vendorName} isManager={ctx.isManager}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <h1 className="font-display text-2xl text-ink">Riders</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        Your own riders and dispatch-company riders, saved once and picked on any delivery. Riders don&apos;t need an
        account — they carry the order code and the customer confirms with their PIN.{" "}
        {isManagerRole ? "You can edit or archive riders." : "Anyone can add a rider; a manager can edit or archive them."}
      </p>
      <RiderManager rows={rows}
        branches={multiBranch && !ctx.branchId ? ctx.branches.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name })) : []}
        canPickBranch={ctx.isManager} />
    </VendorShell>
  );
}
