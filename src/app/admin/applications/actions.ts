"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Approve a vendor application: create the vendor record (default plan, pending
 * verification) and mark the application approved, linking the new vendor.
 *
 * If the applicant set a password when they applied (applicant_id), their
 * account becomes the laundry's business-wide manager, so they can manage the
 * business with the same login straight away.
 */
export async function approveApplication(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: app } = await supabase
    .from("vendor_applications").select("*").eq("id", id).single();
  if (!app) return { error: "Application not found." };
  if (app.status !== "pending") return { error: "Already reviewed." };

  const { data: plan } = await supabase
    .from("vendor_plans").select("id").eq("is_default", true).limit(1).maybeSingle();

  const { data: vendor, error: vErr } = await supabase.from("vendors").insert({
    name: app.business_name, area: app.area, city: app.city,
    delivery: app.delivery, status: "pending", plan_id: plan?.id ?? null,
  } as never).select("id").single();
  if (vErr) return { error: vErr.message };

  const { error } = await supabase.from("vendor_applications").update({
    status: "approved", vendor_id: vendor!.id, reviewed_by: user?.id,
  } as never).eq("id", id);
  if (error) return { error: error.message };

  // Make the applicant's own account the business-wide manager (role + profile
  // changes need the service key, like Team). Never touch a laundriroom staff
  // account, and don't fail the approval if linking can't happen — an admin can
  // always add the manager from Team afterwards.
  let message: string | undefined;
  const applicantId = (app as { applicant_id?: string | null }).applicant_id ?? null;
  if (applicantId) {
    const service = createServiceClient();
    if (!service) {
      message = "Vendor created, but set SUPABASE_SERVICE_ROLE_KEY to give the applicant manager access automatically.";
    } else {
      const { data: prof } = await service.from("profiles")
        .select("role").eq("id", applicantId).maybeSingle();
      const role = (prof as { role?: string } | null)?.role;
      if (role && ["platform_admin", "support_agent"].includes(role)) {
        message = "Vendor created. The applicant is a laundriroom team member, so their role was left unchanged.";
      } else {
        await service.from("profiles").update({ role: "vendor_manager" }).eq("id", applicantId);
        const { data: existing } = await service.from("vendor_memberships")
          .select("id").eq("vendor_id", vendor!.id).eq("profile_id", applicantId).maybeSingle();
        if (!existing) {
          await service.from("vendor_memberships").insert({
            vendor_id: vendor!.id, profile_id: applicantId, role: "vendor_manager", branch_id: null,
          });
        }
        await service.from("audit_log").insert({
          actor_id: user?.id ?? null, action: "application_approved_manager_linked",
          entity: "vendor", entity_id: vendor!.id, after: { application_id: id, profile_id: applicantId },
        });
      }
    }
  }

  revalidatePath("/admin/applications");
  revalidatePath("/admin/vendors");
  return { ok: true, message };
}

export async function rejectApplication(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("vendor_applications").update({
    status: "rejected", reviewed_by: user?.id,
  } as never).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/applications");
  return { ok: true };
}
