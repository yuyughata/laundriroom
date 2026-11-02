"use server";

import { createClient } from "@/lib/supabase/server";
import type { DeliveryMode } from "@/lib/database.types";

/**
 * Public vendor application. Anyone (even a signed-out visitor) may submit one;
 * RLS grants anon INSERT on vendor_applications. An admin reviews it under
 * Admin → Applications and, on approval, a vendor record is created.
 */
export async function submitApplication(formData: FormData) {
  const supabase = createClient();

  const business_name = String(formData.get("business_name") || "").trim();
  const contact_name = String(formData.get("contact_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const area = String(formData.get("area") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const delivery = (String(formData.get("delivery") || "own_riders")) as DeliveryMode;
  const message = String(formData.get("message") || "").trim() || null;

  const agreed = String(formData.get("agree") || "") === "on";

  if (!business_name) return { error: "Enter your business name." };
  if (!contact_name) return { error: "Enter a contact name." };
  if (!email) return { error: "Enter an email." };
  if (!phone) return { error: "Enter a phone number." };
  if (!agreed) return { error: "Please accept the Vendor Agreement to apply." };

  const { error } = await supabase.from("vendor_applications").insert({
    business_name, contact_name, email, phone, area, city, delivery, message,
    agreed_terms: true, agreed_at: new Date().toISOString(),
  } as never);
  if (error) return { error: error.message };
  return { ok: true };
}
