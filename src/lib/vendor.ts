import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Profile, Branch } from "@/lib/database.types";

export type VendorContext = {
  profile: Profile;
  vendorId: string;
  vendorName: string;
  /** Business-wide manager: branches, staff, prices, promos, payout account (matches is_vendor_manager in the DB). */
  isManager: boolean;
  /** The branch this staff member is tied to; null = business-wide (sees every branch). */
  branchId: string | null;
  branchName: string | null;
  /** The business's branches this person can work in (active ones first). */
  branches: Pick<Branch, "id" | "name" | "is_main" | "active">[];
  /** "Manager", "Branch manager", "Attendant" or "Rider", for the header. */
  roleLabel: string;
};

/** Resolve the vendor (and branch) the current staff member belongs to. */
export async function getVendorContext(): Promise<VendorContext> {
  const profile = await requireRole(["attendant", "vendor_manager", "rider"]);
  const supabase = createClient();

  const { data: membership } = await supabase
    .from("vendor_memberships" as never)
    .select("vendor_id, role, vendors(name)")
    .eq("profile_id", profile.id)
    .limit(1)
    .maybeSingle();

  const m = membership as
    | { vendor_id: string; role: string; vendors: { name: string } | null }
    | null;

  if (!m) {
    // Staff account not yet attached to a vendor.
    redirect("/vendor/no-vendor");
  }

  // Branch details (migration 0033). Read separately so the dashboard still
  // works, as single-location, on a database that doesn't have branches yet.
  let branchId: string | null = null;
  let branches: VendorContext["branches"] = [];
  const { data: mb, error: mbErr } = await supabase
    .from("vendor_memberships" as never).select("branch_id")
    .eq("profile_id", profile.id).eq("vendor_id", m.vendor_id).limit(1).maybeSingle();
  if (!mbErr) {
    branchId = (mb as { branch_id: string | null } | null)?.branch_id ?? null;
    const { data: bs } = await supabase.from("branches")
      .select("id, name, is_main, active").eq("vendor_id", m.vendor_id)
      .order("is_main", { ascending: false }).order("name");
    branches = ((bs ?? []) as VendorContext["branches"]).filter((b) => !branchId || b.id === branchId);
  }

  const isManagerRole = m.role === "vendor_manager";
  return {
    profile,
    vendorId: m.vendor_id,
    vendorName: m.vendors?.name ?? "Your station",
    isManager: isManagerRole && !branchId,
    branchId,
    branchName: branchId ? branches.find((b) => b.id === branchId)?.name ?? null : null,
    branches,
    roleLabel: isManagerRole ? (branchId ? "Branch manager" : "Manager") : m.role === "rider" ? "Rider" : "Attendant",
  };
}
