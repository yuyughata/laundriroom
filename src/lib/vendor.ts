import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Profile } from "@/lib/database.types";

export type VendorContext = {
  profile: Profile;
  vendorId: string;
  vendorName: string;
  isManager: boolean;
};

/** Resolve the vendor the current staff member belongs to. */
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

  return {
    profile,
    vendorId: m.vendor_id,
    vendorName: m.vendors?.name ?? "Your station",
    isManager: m.role === "vendor_manager",
  };
}
