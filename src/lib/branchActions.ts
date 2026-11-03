"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { geocode, addressText } from "@/lib/maps";

/**
 * Branch management, shared by Vendor → Branches (business-wide managers) and
 * Admin → Vendors → Branches (platform admins, on a vendor's behalf). The
 * database enforces who may write (branches RLS + guard_branch_columns); the
 * checks here just give clear messages.
 */

type Result = { ok: true; id?: string } | { error: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function readBranch(fd: FormData) {
  const name = String(fd.get("name") || "").trim();
  const opens_at = String(fd.get("opens_at") || "07:00").trim();
  const closes_at = String(fd.get("closes_at") || "18:00").trim();
  const radius = Number(fd.get("service_radius_km") || 5);
  if (!name) return { error: "Give the branch a name (e.g. Yaba, Lekki Phase 1)." } as const;
  if (name.length > 80) return { error: "Keep the branch name under 80 characters." } as const;
  if (!TIME.test(opens_at) || !TIME.test(closes_at)) return { error: "Enter opening and closing times as HH:MM." } as const;
  if (opens_at >= closes_at) return { error: "Closing time must be after opening time." } as const;
  if (!Number.isFinite(radius) || radius <= 0 || radius > 100) return { error: "Service radius must be between 1 and 100 km." } as const;
  const opt = (k: string) => String(fd.get(k) || "").trim() || null;
  return {
    name, opens_at, closes_at, service_radius_km: Math.round(radius * 10) / 10,
    phone: opt("phone"), address_line: opt("address_line"), area: opt("area"), city: opt("city"),
  } as const;
}

async function canManage(vendorId: string): Promise<string | null> {
  const profile = await getProfile();
  if (!profile) return "Please sign in again.";
  if (profile.role === "platform_admin") return null;
  const supabase = createClient();
  const { data } = await supabase.from("vendor_memberships" as never)
    .select("role, branch_id").eq("profile_id", profile.id).eq("vendor_id", vendorId).maybeSingle();
  const m = data as { role: string; branch_id: string | null } | null;
  if (!m || m.role !== "vendor_manager" || m.branch_id) return "Only the business's main manager can manage branches.";
  return null;
}

function refresh(vendorId: string) {
  revalidatePath("/vendor/branches");
  revalidatePath("/vendor/queue");
  revalidatePath(`/admin/vendors/${vendorId}`);
  revalidatePath("/admin/vendors");
}

/** Coordinates for distance pricing, if Google Maps is configured. */
async function locate(b: { address_line: string | null; area: string | null; city: string | null }) {
  if (!b.address_line && !b.area) return {};
  const at = await geocode(addressText(b));
  return at ? { lat: at.lat, lng: at.lng } : {};
}

export async function createBranch(vendorId: string, fd: FormData): Promise<Result> {
  const denied = await canManage(vendorId);
  if (denied) return { error: denied };
  const b = readBranch(fd);
  if ("error" in b) return { error: b.error as string };
  const supabase = createClient();
  const { data, error } = await supabase.from("branches")
    .insert({ vendor_id: vendorId, ...b, ...(await locate(b)) } as never).select("id").single();
  if (error) return { error: error.message };
  refresh(vendorId);
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateBranch(vendorId: string, branchId: string, fd: FormData): Promise<Result> {
  const denied = await canManage(vendorId);
  if (denied) return { error: denied };
  const b = readBranch(fd);
  if ("error" in b) return { error: b.error as string };
  const supabase = createClient();
  const { error } = await supabase.from("branches")
    .update({ ...b, ...(await locate(b)) } as never).eq("id", branchId).eq("vendor_id", vendorId);
  if (error) return { error: error.message };
  refresh(vendorId);
  return { ok: true };
}

/** Open/closed right now (the manual switch), e.g. closed for a public holiday. */
export async function setBranchOpen(vendorId: string, branchId: string, isOpen: boolean): Promise<Result> {
  const profile = await getProfile();
  if (!profile) return { error: "Please sign in again." };
  const supabase = createClient();
  // Branch staff may flip their own branch's switch; RLS limits writes to managers and admins.
  const { error } = await supabase.from("branches")
    .update({ is_open: isOpen } as never).eq("id", branchId).eq("vendor_id", vendorId);
  if (error) return { error: error.message };
  refresh(vendorId);
  return { ok: true };
}

/** Stop or resume taking orders at a branch. The main branch always stays active. */
export async function setBranchActive(vendorId: string, branchId: string, active: boolean): Promise<Result> {
  const denied = await canManage(vendorId);
  if (denied) return { error: denied };
  const supabase = createClient();
  const { data: br } = await supabase.from("branches").select("is_main").eq("id", branchId).maybeSingle();
  if ((br as { is_main?: boolean } | null)?.is_main && !active) return { error: "The main branch can't be closed down. Make another branch main first (ask laundriroom support)." };
  const { error } = await supabase.from("branches")
    .update({ active } as never).eq("id", branchId).eq("vendor_id", vendorId);
  if (error) return { error: error.message };
  refresh(vendorId);
  return { ok: true };
}

/** Put a staff member at one branch, or make them business-wide (branchId null). */
export async function setStaffBranch(vendorId: string, membershipId: string, branchId: string | null): Promise<Result> {
  const denied = await canManage(vendorId);
  if (denied) return { error: denied };
  const profile = await getProfile();
  const supabase = createClient();
  const { data: m } = await supabase.from("vendor_memberships" as never)
    .select("profile_id").eq("id", membershipId).eq("vendor_id", vendorId).maybeSingle();
  if (!m) return { error: "Staff member not found." };
  if ((m as { profile_id: string }).profile_id === profile?.id && profile?.role !== "platform_admin") {
    return { error: "You can't move yourself to a branch — you'd lose access to the others." };
  }
  const { error } = await supabase.from("vendor_memberships" as never)
    .update({ branch_id: branchId } as never).eq("id", membershipId).eq("vendor_id", vendorId);
  if (error) return { error: error.message };
  refresh(vendorId);
  return { ok: true };
}
