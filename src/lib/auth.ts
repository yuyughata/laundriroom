import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile, UserRole } from "@/lib/database.types";

/** Current signed-in profile, or null. Degrades to null if Supabase isn't configured. */
export async function getProfile(): Promise<Profile | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null; // not connected yet — treat as signed-out
  }
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    return data ?? null;
  } catch {
    return null;
  }
}

/** Require a signed-in profile; redirect to login otherwise. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Require one of the given roles; redirect to the role's home otherwise. */
export async function requireRole(roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}

export function homeFor(role: UserRole): string {
  switch (role) {
    case "platform_admin":
    case "support_agent": return "/admin";
    case "attendant":
    case "vendor_manager":
    case "rider": return "/vendor/queue";
    default: return "/customer";
  }
}

/** The vendor id a staff member belongs to (first membership). */
export async function myVendorId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("vendor_memberships" as never)
    .select("vendor_id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();
  return (data as { vendor_id: string } | null)?.vendor_id ?? null;
}

/**
 * Money (ledger, payouts, statements) is for the business's main manager and
 * laundriroom staff only — not attendants, riders or branch managers.
 * Mirrors the database rules (0040: is_vendor_manager).
 */
export async function canSeeVendorFinances(profile: Profile): Promise<boolean> {
  if (profile.role === "platform_admin" || profile.role === "support_agent") return true;
  if (profile.role !== "vendor_manager") return false;
  const supabase = createClient();
  const { data } = await supabase.from("vendor_memberships" as never)
    .select("branch_id").eq("profile_id", profile.id).limit(1).maybeSingle();
  return !!data && (data as { branch_id: string | null }).branch_id === null;
}
