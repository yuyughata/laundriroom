"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * NDPR right to erasure (self-service). A customer deletes their own account:
 * we anonymise the profile, remove saved addresses, and disable the login.
 * Order and payment records are retained (anonymised via the profile) to meet
 * legal and accounting obligations, as the NDPR permits.
 *
 * Only a `customer` can self-erase here — staff/admin accounts are tied to
 * vendor operations and must go through support, so we don't orphan that data.
 */
export async function deleteMyAccount(confirmText: string) {
  if ((confirmText || "").trim().toUpperCase() !== "DELETE") {
    return { error: 'Type DELETE to confirm.' };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (prof as { role?: string } | null)?.role;
  if (role !== "customer") {
    return { error: "Staff and admin accounts can't be deleted here. Please contact support at hello@laundriroom.app." };
  }

  const admin = createServiceClient();
  if (!admin) return { error: "Account deletion isn't available right now. Please contact support." };

  // Guard: don't erase someone mid-order. Open = not closed/cancelled.
  const { count: openOrders } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", user.id)
    .not("status", "in", "(closed,cancelled)");
  if ((openOrders ?? 0) > 0) {
    return { error: "You still have orders in progress. Please wait until they're completed (or contact support) before deleting your account." };
  }

  const uid = user.id;

  // 1. Anonymise the profile (service key — role/status columns are guarded).
  const { error: updErr } = await admin.from("profiles").update({
    full_name: "Deleted account",
    email: null,
    phone: null,
    newsletter_opt_out: true,
    referral_code: null,
    status: "suspended",
    deleted_at: new Date().toISOString(),
  }).eq("id", uid);
  if (updErr) return { error: "We couldn't delete your account just now. Please try again or contact support." };

  // 2. Remove saved pickup/delivery addresses (pure personal data).
  await admin.from("customer_addresses").delete().eq("customer_id", uid);

  // 3. Scrub and disable the login so the account can't be used or re-identified.
  try {
    await admin.auth.admin.updateUserById(uid, {
      email: `deleted-${uid}@deleted.invalid`,
      user_metadata: {},
      app_metadata: {},
    });
  } catch { /* best effort */ }
  try {
    // Soft delete keeps referential integrity (orders reference the profile)
    // while blocking sign-in.
    await admin.auth.admin.deleteUser(uid, true);
  } catch { /* best effort */ }

  // 4. Accountability record (best effort).
  try {
    await admin.from("audit_log").insert({
      actor_id: uid, action: "account_self_deleted", entity: "profile", entity_id: uid,
    });
  } catch { /* best effort */ }

  // 5. Clear this session's cookies.
  try { await supabase.auth.signOut(); } catch { /* ignore */ }

  return { ok: true };
}
