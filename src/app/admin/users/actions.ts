"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/lib/database.types";
import { notifyUser } from "@/lib/notify";

const STAFF_ROLES: UserRole[] = ["attendant", "vendor_manager", "rider"];

/** Guard: only a platform admin may manage users. */
async function requirePlatformAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (data?.role !== "platform_admin") return { ok: false as const, error: "Admin only." };
  return { ok: true as const, supabase, adminId: user.id };
}

export async function updateUserRole(id: string, role: UserRole) {
  const g = await requirePlatformAdmin();
  if (!g.ok) return { error: g.error };

  const { error } = await g.supabase.from("profiles").update({ role } as never).eq("id", id);
  if (error) return { error: error.message };

  // If the new role isn't a staff role, drop any vendor memberships.
  if (!STAFF_ROLES.includes(role)) {
    await g.supabase.from("vendor_memberships").delete().eq("profile_id", id);
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserStatus(id: string, status: "active" | "suspended") {
  const g = await requirePlatformAdmin();
  if (!g.ok) return { error: g.error };
  const { data: before } = await g.supabase.from("profiles").select("status").eq("id", id).single();
  const { error } = await g.supabase.from("profiles").update({ status } as never).eq("id", id);
  if (error) return { error: error.message };
  if (before?.status !== status) {
    await notifyUser(status === "suspended" ? "account_suspended" : "account_reactivated", id);
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Attach a staff member to a vendor (one vendor per person in this UI). */
export async function attachToVendor(id: string, vendorId: string) {
  const g = await requirePlatformAdmin();
  if (!g.ok) return { error: g.error };

  const { data: profile } = await g.supabase.from("profiles").select("role").eq("id", id).single();
  const role = (profile?.role ?? "attendant") as UserRole;
  if (!STAFF_ROLES.includes(role)) return { error: "Only staff can be attached to a vendor." };

  await g.supabase.from("vendor_memberships").delete().eq("profile_id", id);
  if (vendorId) {
    const { error } = await g.supabase
      .from("vendor_memberships").insert({ vendor_id: vendorId, profile_id: id, role } as never);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Delete a user. Customers with order history can't be hard-deleted (records are
 * preserved) — deactivate them instead. Needs the service-role key.
 */
export async function deleteUser(id: string) {
  const g = await requirePlatformAdmin();
  if (!g.ok) return { error: g.error };
  if (id === g.adminId) return { error: "You can't delete your own account." };

  const service = createServiceClient();
  if (!service) return { error: "Deleting users needs the service-role key (SUPABASE_SERVICE_ROLE_KEY)." };

  const { count } = await service
    .from("orders").select("*", { count: "exact", head: true }).eq("customer_id", id);
  if (count && count > 0) {
    return { error: "This user has orders. Deactivate them instead so the records are kept." };
  }

  await service.from("vendor_memberships").delete().eq("profile_id", id);
  const { error } = await service.auth.admin.deleteUser(id);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Email a user via Resend. The admin's WhatsApp is handled client-side with a
 * wa.me link (no API needed). Logs to notification_log.
 */
export async function emailUser(id: string, subject: string, body: string) {
  const g = await requirePlatformAdmin();
  if (!g.ok) return { error: g.error };

  const { data: target } = await g.supabase.from("profiles").select("email, full_name").eq("id", id).single();
  if (!target?.email) return { error: "This user has no email on file." };

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { error: "Email isn't configured. Add RESEND_API_KEY, or connect Resend under Integrations." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "laundriroom <notifications@laundriroom.example>",
      to: target.email, subject, text: body,
    }),
  }).catch(() => null);

  const service = createServiceClient();
  const okSend = Boolean(res && res.ok);
  if (service) {
    await service.from("notification_log").insert({
      event: "order_confirmed", channel: "email", recipient: target.email,
      status: okSend ? "sent" : "failed", detail: okSend ? "admin message" : "admin message failed",
    });
  }
  if (!okSend) return { error: "Resend rejected the message. Check the API key and sender domain." };
  return { ok: true };
}
