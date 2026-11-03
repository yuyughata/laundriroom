"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";
import { safeNext } from "@/lib/nav";

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user!.id).single();
  const role = profile?.role ?? "customer";
  // Back to where they were heading (e.g. a vendor's order form) — customer
  // pages only make sense for customers.
  const next = safeNext(formData.get("next"));
  redirect(next && (role === "customer" || !next.startsWith("/customer")) ? next : homeFor(role));
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

  // signUp signs the user in (email confirmation pending) → straight to the
  // app, or back to where they were heading (e.g. a vendor's order form).
  redirect(safeNext(formData.get("next")) ?? "/customer?welcome=1");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ─── Passwords ──────────────────────────────────────────────────────────────

const MIN_PASSWORD = 8;

/** Email a password-reset link (Supabase sends it with the "Reset password" template). */
export async function requestPasswordReset(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { error: "Enter your email." };
  const supabase = createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  // Same answer whether or not the account exists, so emails can't be probed.
  if (error && !/rate limit/i.test(error.message)) console.error("resetPasswordForEmail:", error.message);
  if (error && /rate limit/i.test(error.message)) return { error: "Too many requests — try again in a few minutes." };
  return { sent: true };
}

/** Set a new password after following the reset link (the link signs the user in). */
export async function setNewPassword(_prev: unknown, formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password !== confirm) return { error: "The passwords don't match." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  await notifyUser("password_changed", user.id);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  redirect(homeFor(profile?.role ?? "customer"));
}

/** Change password while signed in. Re-checks the current password first. */
export async function changePassword(_prev: unknown, formData: FormData) {
  const current = String(formData.get("current") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password !== confirm) return { error: "The new passwords don't match." };
  if (password === current) return { error: "Choose a password you haven't used here." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Please sign in again." };
  const { error: badCurrent } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (badCurrent) return { error: "Your current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  await notifyUser("password_changed", user.id);
  return { ok: true };
}
