"use server";

import { createClient } from "@/lib/supabase/server";
import type { DeliveryMode } from "@/lib/database.types";

/**
 * Public vendor application. Anyone (even a signed-out visitor) may submit one;
 * RLS grants anon INSERT on vendor_applications. An admin reviews it under
 * Admin → Applications and, on approval, a vendor record is created.
 *
 * A signed-out applicant also picks a password: we create their account (a
 * customer, like any sign-up) and link it to the application (applicant_id), so
 * they can sign in and track their status while we review, and keep the same
 * login once approved. A visitor who is already signed in just gets the
 * application linked to their account.
 */
export async function submitApplication(formData: FormData) {
  const supabase = createClient();
  const { data: { user: current } } = await supabase.auth.getUser();

  const business_name = String(formData.get("business_name") || "").trim();
  const contact_name = String(formData.get("contact_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const area = String(formData.get("area") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const delivery = (String(formData.get("delivery") || "own_riders")) as DeliveryMode;
  const message = String(formData.get("message") || "").trim() || null;
  const password = String(formData.get("password") || "");

  const agreed = String(formData.get("agree") || "") === "on";

  if (!business_name) return { error: "Enter your business name." };
  if (!contact_name) return { error: "Enter a contact name." };
  if (!email) return { error: "Enter an email." };
  if (!phone) return { error: "Enter a phone number." };
  if (!agreed) return { error: "Please accept the Partner Agreement to apply." };

  // Signed-out applicants create an account now so they can access it while we
  // review. signUp sets the session cookie (email confirmation pending), so the
  // insert below runs as the new user.
  let applicantId: string | null = current?.id ?? null;
  if (!current) {
    if (password.length < 8) {
      return { error: "Choose a password of at least 8 characters so you can sign in while we review your application." };
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const { data: signed, error: suErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
        data: { full_name: contact_name, phone, role: "customer" },
      },
    });
    if (suErr) {
      if (/already|registered|exists/i.test(suErr.message)) {
        return { error: "You already have an account with this email. Please sign in first, then apply." };
      }
      return { error: suErr.message };
    }
    applicantId = signed.user?.id ?? null;
  }

  const { error } = await supabase.from("vendor_applications").insert({
    business_name, contact_name, email, phone, area, city, delivery, message,
    agreed_terms: true, agreed_at: new Date().toISOString(),
    applicant_id: applicantId,
  } as never);
  if (error) return { error: error.message };
  return { ok: true };
}
