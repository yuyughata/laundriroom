"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth";

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user!.id).single();
  redirect(homeFor(profile?.role ?? "customer"));
}

export async function signUp(_prev: unknown, formData: FormData) {
  const full_name = String(formData.get("full_name") || "");
  const email = String(formData.get("email") || "");
  const phone = String(formData.get("phone") || "");
  const password = String(formData.get("password") || "");
  const ref = String(formData.get("ref") || "").trim().toUpperCase();

  if (!full_name || !email || !phone || password.length < 8) {
    return { error: "Enter your name, email, phone, and a password of at least 8 characters." };
  }

  const supabase = createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // customers can order before verifying; this sends the verification email
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: { full_name, phone, role: "customer", ...(ref ? { ref } : {}) },
    },
  });
  if (error) return { error: error.message };

  // signUp signs the user in (email confirmation pending) → straight to the app
  redirect("/customer?welcome=1");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
