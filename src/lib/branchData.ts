import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Branch } from "@/lib/database.types";
import type { StaffRow } from "@/components/branches/BranchManager";

/** All branches of a vendor (as the caller's RLS allows), main first. */
export async function loadBranches(vendorId: string): Promise<Branch[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("branches").select("*").eq("vendor_id", vendorId)
    .order("is_main", { ascending: false }).order("active", { ascending: false }).order("name");
  if (error) return [];
  return (data ?? []) as Branch[];
}

/**
 * A vendor's staff with their branch. Staff can't read colleagues' profiles
 * under RLS, so names come through the service client — only call this after
 * checking the caller manages the vendor (or is an admin).
 */
export async function loadStaff(vendorId: string, currentProfileId?: string): Promise<StaffRow[]> {
  const db = createServiceClient() ?? createClient();
  const { data } = await db.from("vendor_memberships")
    .select("id, role, branch_id, profile_id, profiles(full_name)").eq("vendor_id", vendorId);
  return ((data ?? []) as { id: string; role: string; branch_id: string | null; profile_id: string; profiles: { full_name: string | null } | null }[])
    .map((m) => ({
      id: m.id, role: m.role, branch_id: m.branch_id,
      name: m.profiles?.full_name || "Staff member", isYou: m.profile_id === currentProfileId,
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}
