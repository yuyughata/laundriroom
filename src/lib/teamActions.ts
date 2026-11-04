"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

/**
 * Team management: a vendor's main (business-wide) manager adds and manages
 * their staff from Vendor → Team; a laundriroom platform admin can do the
 * same on the vendor's behalf from Admin → Vendors → a vendor.
 *
 * New staff are invited by email: Supabase sends them a link to set their own
 * password, then they sign in at /login with that email. Roles and accounts
 * are changed with the service key (profiles' role is admin-only in the
 * database), so every action here checks the caller first.
 */

type Result = { ok: true; message?: string } | { error: string };
const STAFF_ROLES = ["vendor_manager", "attendant"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

async function authorize(vendorId: string) {
  const profile = await getProfile();
  if (!profile) return { error: "Please sign in again." } as const;
  const service = createServiceClient();
  if (!service) return { error: "Managing staff needs SUPABASE_SERVICE_ROLE_KEY on the server." } as const;
  if (profile.role === "platform_admin") return { profile, service, isAdmin: true } as const;
  const supabase = createClient();
  const { data } = await supabase.from("vendor_memberships" as never)
    .select("role, branch_id").eq("profile_id", profile.id).eq("vendor_id", vendorId).maybeSingle();
  const m = data as { role: string; branch_id: string | null } | null;
  if (!m || m.role !== "vendor_manager" || m.branch_id) {
    return { error: "Only the business's main manager can manage the team." } as const;
  }
  return { profile, service, isAdmin: false } as const;
}

function refresh(vendorId: string) {
  revalidatePath("/vendor/team");
  revalidatePath("/vendor/branches");
  revalidatePath(`/admin/vendors/${vendorId}`);
  revalidatePath("/admin/users");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function audit(service: any, actorId: string, action: string, vendorId: string, after: Record<string, unknown>) {
  await service.from("audit_log").insert({ actor_id: actorId, action, entity: "vendor", entity_id: vendorId, after });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkBranch(service: any, vendorId: string, branchId: string | null) {
  if (!branchId) return null;
  const { data } = await service.from("branches").select("id, active").eq("id", branchId).eq("vendor_id", vendorId).maybeSingle();
  return data?.active ? null : "Pick one of your active branches.";
}

/** Invite a person to the team by email (or add them if they already have an account). */
export async function inviteStaff(vendorId: string, fd: FormData): Promise<Result> {
  const g = await authorize(vendorId);
  if ("error" in g) return { error: g.error! };
  const { service, profile } = g;

  const full_name = String(fd.get("full_name") || "").trim();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const phone = String(fd.get("phone") || "").trim() || null;
  const role = String(fd.get("role") || "attendant") as StaffRole;
  const branch_id = String(fd.get("branch_id") || "") || null;
  if (!full_name) return { error: "Enter the person's name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address — that's where their login link goes." };
  if (!STAFF_ROLES.includes(role)) return { error: "Choose Manager or Attendant." };
  const badBranch = await checkBranch(service, vendorId, branch_id);
  if (badBranch) return { error: badBranch };

  const { data: existing } = await service.from("profiles").select("id, role, full_name").ilike("email", email).maybeSingle();
  let profileId: string;
  let message: string;

  if (existing) {
    if (existing.id === profile.id) return { error: "That's your own account." };
    if (["platform_admin", "support_agent"].includes(existing.role)) {
      return { error: "That email belongs to a laundriroom team account and can't join a vendor." };
    }
    const { data: mem } = await service.from("vendor_memberships").select("vendor_id").eq("profile_id", existing.id);
    if ((mem ?? []).some((m: { vendor_id: string }) => m.vendor_id === vendorId)) return { error: "They're already on your team." };
    if ((mem ?? []).length) return { error: "That person already works for another laundry on laundriroom." };
    profileId = existing.id;
    message = existing.role === "customer"
      ? `${existing.full_name || email} already had a laundriroom account, so it’s now a staff account. They sign in with their usual email and password.`
      : `${existing.full_name || email} has been added. They sign in with their usual email and password.`;
  } else {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      data: { full_name, phone },
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    });
    if (error || !data?.user) {
      return { error: /rate|limit/i.test(error?.message ?? "") ? "Too many invites just now — try again in a minute." : (error?.message ?? "Couldn't send the invite.") };
    }
    profileId = data.user.id;
    message = `Invite sent to ${email}. They’ll get an email with a link to set their password, then sign in at the laundriroom login page.`;
  }

  // Role on the profile (decides which app they see) and the membership.
  const { error: pErr } = await service.from("profiles")
    .update({ role, ...(existing ? {} : { full_name }), ...(phone ? { phone } : {}) }).eq("id", profileId);
  if (pErr) return { error: pErr.message };
  const { error: mErr } = await service.from("vendor_memberships")
    .insert({ vendor_id: vendorId, profile_id: profileId, role, branch_id });
  if (mErr) return { error: mErr.message };

  await audit(service, profile.id, "staff_added", vendorId, { profile_id: profileId, email, role, branch_id, by_admin: g.isAdmin });
  refresh(vendorId);
  return { ok: true, message };
}

async function loadMember(vendorId: string, membershipId: string) {
  const service = createServiceClient()!;
  const { data } = await service.from("vendor_memberships")
    .select("id, profile_id, role, branch_id, profiles(email, full_name)").eq("id", membershipId).eq("vendor_id", vendorId).maybeSingle();
  return data as { id: string; profile_id: string; role: string; branch_id: string | null; profiles: { email: string | null; full_name: string | null } | null } | null;
}

/** Would this change leave the business without a main (business-wide) manager? */
async function wouldOrphan(vendorId: string, membershipId: string) {
  const service = createServiceClient()!;
  const { data } = await service.from("vendor_memberships")
    .select("id").eq("vendor_id", vendorId).eq("role", "vendor_manager").is("branch_id", null);
  return !(data ?? []).some((m: { id: string }) => m.id !== membershipId);
}

/** Change a team member's role and/or branch. */
export async function updateStaff(vendorId: string, membershipId: string, change: { role?: string; branchId?: string | null }): Promise<Result> {
  const g = await authorize(vendorId);
  if ("error" in g) return { error: g.error! };
  const m = await loadMember(vendorId, membershipId);
  if (!m) return { error: "That person isn't on this team." };
  if (m.profile_id === g.profile.id && !g.isAdmin) return { error: "Ask laundriroom support to change your own role or branch." };

  const role = change.role ?? m.role;
  const branch_id = change.branchId === undefined ? m.branch_id : change.branchId;
  if (change.role !== undefined && !STAFF_ROLES.includes(role as StaffRole) && role !== m.role) return { error: "Choose Manager or Attendant." };
  const badBranch = await checkBranch(g.service, vendorId, branch_id);
  if (badBranch) return { error: badBranch };
  const wasMain = m.role === "vendor_manager" && !m.branch_id;
  const staysMain = role === "vendor_manager" && !branch_id;
  if (wasMain && !staysMain && await wouldOrphan(vendorId, membershipId)) {
    return { error: "The business needs at least one main manager (all branches). Make someone else main manager first." };
  }

  const { error } = await g.service.from("vendor_memberships").update({ role, branch_id }).eq("id", membershipId);
  if (error) return { error: error.message };
  if (role !== m.role) {
    const { error: pErr } = await g.service.from("profiles").update({ role }).eq("id", m.profile_id);
    if (pErr) return { error: pErr.message };
  }
  await audit(g.service, g.profile.id, "staff_changed", vendorId, { profile_id: m.profile_id, role, branch_id, by_admin: g.isAdmin });
  refresh(vendorId);
  return { ok: true };
}

/** Remove someone from the team. Their account stays, as a customer account. */
export async function removeStaff(vendorId: string, membershipId: string): Promise<Result> {
  const g = await authorize(vendorId);
  if ("error" in g) return { error: g.error! };
  const m = await loadMember(vendorId, membershipId);
  if (!m) return { error: "That person isn't on this team." };
  if (m.profile_id === g.profile.id) return { error: "You can't remove yourself." };
  if (m.role === "vendor_manager" && !m.branch_id && await wouldOrphan(vendorId, membershipId)) {
    return { error: "The business needs at least one main manager." };
  }
  const { error } = await g.service.from("vendor_memberships").delete().eq("id", membershipId);
  if (error) return { error: error.message };
  await g.service.from("profiles").update({ role: "customer" }).eq("id", m.profile_id);
  await audit(g.service, g.profile.id, "staff_removed", vendorId, { profile_id: m.profile_id, by_admin: g.isAdmin });
  refresh(vendorId);
  return { ok: true, message: `${m.profiles?.full_name || "They"} can no longer open your vendor dashboard.` };
}

/** Email a team member a link to set (or reset) their password. */
export async function sendLoginLink(vendorId: string, membershipId: string): Promise<Result> {
  const g = await authorize(vendorId);
  if ("error" in g) return { error: g.error! };
  const m = await loadMember(vendorId, membershipId);
  if (!m?.profiles?.email) return { error: "This person has no email address on their account." };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { error } = await g.service.auth.resetPasswordForEmail(m.profiles.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: /rate|limit/i.test(error.message) ? "A link was sent very recently — try again in a minute." : error.message };
  return { ok: true, message: `Login link sent to ${m.profiles.email}.` };
}
