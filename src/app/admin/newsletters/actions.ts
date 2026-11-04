"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { cleanNewsletterHtml, cleanUrl } from "@/lib/newsletterHtml";
import type { NewsletterAudience, NewsletterGroup } from "@/lib/database.types";

const GROUPS: NewsletterGroup[] = ["customers", "vendor_managers", "vendor_staff", "team", "everyone"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Newsletters are for platform admins (also enforced by RLS). */
async function admin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "platform_admin") return null;
  return profile;
}

function cleanAudience(a: unknown): NewsletterAudience {
  const x = (a ?? {}) as Partial<NewsletterAudience>;
  const groups = Array.isArray(x.groups) ? x.groups.filter((g): g is NewsletterGroup => GROUPS.includes(g as NewsletterGroup)) : [];
  const user_ids = Array.isArray(x.user_ids) ? x.user_ids.filter((id) => typeof id === "string" && UUID.test(id)).slice(0, 500) : [];
  return { groups: [...new Set(groups)], user_ids: [...new Set(user_ids)] };
}

export type NewsletterInput = {
  subject: string; preheader: string; header_image_url: string | null; footer_image_url: string | null;
  body_html: string; cta_label: string; cta_url: string; audience: NewsletterAudience;
};

/** Create or update a draft. Returns the id. The body is cleaned on every save. */
export async function saveNewsletter(id: string | null, input: NewsletterInput) {
  if (!(await admin())) return { error: "Only platform admins can edit newsletters." };
  const ctaUrl = input.cta_url?.trim() ? cleanUrl(input.cta_url) : null;
  if (input.cta_url?.trim() && !ctaUrl) return { error: "The button link must start with https:// (or http://)." };
  const row = {
    subject: String(input.subject || "").trim().slice(0, 200),
    preheader: String(input.preheader || "").trim().slice(0, 200) || null,
    header_image_url: cleanUrl(input.header_image_url ?? "") ,
    footer_image_url: cleanUrl(input.footer_image_url ?? ""),
    body_html: cleanNewsletterHtml(input.body_html).slice(0, 100_000),
    cta_label: String(input.cta_label || "").trim().slice(0, 60) || null,
    cta_url: ctaUrl,
    audience: cleanAudience(input.audience),
  };
  const supabase = createClient();
  if (id) {
    const { error } = await supabase.from("newsletters").update(row as never).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/newsletters");
    return { id, body_html: row.body_html };
  }
  const { data, error } = await supabase.from("newsletters").insert(row as never).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/admin/newsletters");
  return { id: (data as { id: string }).id, body_html: row.body_html };
}

/** Start a new draft, with the header and footer images of the last newsletter that had them. */
export async function createNewsletterDraft() {
  if (!(await admin())) return { error: "Only platform admins can write newsletters." };
  const supabase = createClient();
  const [{ data: h }, { data: f }] = await Promise.all([
    supabase.from("newsletters").select("header_image_url").not("header_image_url", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("newsletters").select("footer_image_url").not("footer_image_url", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data, error } = await supabase.from("newsletters").insert({
    subject: "", body_html: "", audience: { groups: ["customers"], user_ids: [] },
    header_image_url: (h as { header_image_url?: string } | null)?.header_image_url ?? null,
    footer_image_url: (f as { footer_image_url?: string } | null)?.footer_image_url ?? null,
  } as never).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/admin/newsletters");
  return { id: (data as { id: string }).id };
}

/** A new draft with the same content (and header/footer images). */
export async function duplicateNewsletter(id: string) {
  if (!(await admin())) return { error: "Only platform admins can edit newsletters." };
  const supabase = createClient();
  const { data: n } = await supabase.from("newsletters").select("*").eq("id", id).maybeSingle();
  if (!n) return { error: "Newsletter not found." };
  const src = n as Record<string, unknown>;
  const { data, error } = await supabase.from("newsletters").insert({
    subject: `${src.subject} (copy)`.slice(0, 200), preheader: src.preheader, header_image_url: src.header_image_url,
    footer_image_url: src.footer_image_url, body_html: src.body_html, cta_label: src.cta_label, cta_url: src.cta_url,
    audience: src.audience,
  } as never).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/admin/newsletters");
  return { id: (data as { id: string }).id };
}

export async function deleteNewsletter(id: string) {
  if (!(await admin())) return { error: "Only platform admins can edit newsletters." };
  const supabase = createClient();
  const { data: n } = await supabase.from("newsletters").select("status").eq("id", id).maybeSingle();
  if ((n as { status?: string } | null)?.status !== "draft") return { error: "Only drafts can be deleted." };
  const { error } = await supabase.from("newsletters").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/newsletters");
  return { ok: true };
}

/** How many people an audience reaches (active, has an email, not opted out). */
export async function countAudience(audience: NewsletterAudience) {
  if (!(await admin())) return { error: "Not allowed." };
  const a = cleanAudience(audience);
  if (!a.groups.length && !a.user_ids.length) return { count: 0 };
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase.rpc as any)("newsletter_audience", { p_audience: a }, { count: "exact", head: true });
  if (error) return { error: error.message };
  return { count: count ?? 0 };
}

export type PersonHit = { id: string; full_name: string; email: string; role: string; opted_out: boolean };

/** Find people by name or email to send to individually. */
export async function searchPeople(q: string): Promise<{ people: PersonHit[] } | { error: string }> {
  if (!(await admin())) return { error: "Not allowed." };
  const term = String(q || "").trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (term.length < 2) return { people: [] };
  const supabase = createClient();
  const { data, error } = await supabase.from("profiles")
    .select("id, full_name, email, role, status, newsletter_opt_out")
    .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
    .not("email", "is", null)
    .order("full_name").limit(12);
  if (error) return { error: error.message };
  return {
    people: ((data ?? []) as { id: string; full_name: string; email: string; role: string; status: string; newsletter_opt_out?: boolean }[])
      .filter((p) => p.status === "active")
      .map((p) => ({ id: p.id, full_name: p.full_name, email: p.email, role: p.role, opted_out: !!p.newsletter_opt_out })),
  };
}

/** Names/emails for chosen people (to show them as chips). */
export async function peopleByIds(ids: string[]): Promise<PersonHit[]> {
  if (!(await admin())) return [];
  const clean = ids.filter((id) => UUID.test(id)).slice(0, 500);
  if (!clean.length) return [];
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email, role, newsletter_opt_out").in("id", clean);
  return ((data ?? []) as { id: string; full_name: string; email: string; role: string; newsletter_opt_out?: boolean }[])
    .map((p) => ({ id: p.id, full_name: p.full_name, email: p.email ?? "", role: p.role, opted_out: !!p.newsletter_opt_out }));
}

async function callSender(body: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "Sending isn't set up on this server (SUPABASE_SERVICE_ROLE_KEY missing)." };
  try {
    const res = await fetch(`${url}/functions/v1/send-newsletter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ ...body, site_url: process.env.NEXT_PUBLIC_SITE_URL || "" }),
      signal: AbortSignal.timeout(30000),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return { error: (out as { error?: string }).error || `The sender answered ${res.status}.` };
    return out as { sent?: number; queued?: number; recipients?: number };
  } catch (e) {
    return { error: `Couldn't reach the sender: ${(e as Error).message}` };
  }
}

function readyToSend(n: { subject?: string; body_html?: string }) {
  if (!String(n.subject || "").trim()) return "Add a subject first.";
  if (!String(n.body_html || "").replace(/<[^>]+>/g, "").trim()) return "Write the message first.";
  return null;
}

/** Send the saved newsletter to the signed-in admin only. */
export async function sendTestNewsletter(id: string) {
  const me = await admin();
  if (!me) return { error: "Only platform admins can send newsletters." };
  if (!me.email) return { error: "Your account has no email address." };
  const supabase = createClient();
  const { data: n } = await supabase.from("newsletters").select("subject, body_html").eq("id", id).maybeSingle();
  if (!n) return { error: "Save the newsletter first." };
  const problem = readyToSend(n as { subject: string; body_html: string });
  if (problem) return { error: problem };
  const r = await callSender({ newsletter_id: id, test_to: me.email, test_profile_id: me.id });
  if ("error" in r) return r;
  return { ok: true, to: me.email };
}

/** Send to everyone in the audience. The sender claims it (draft → sending) so it can't go twice. */
export async function sendNewsletter(id: string) {
  if (!(await admin())) return { error: "Only platform admins can send newsletters." };
  const supabase = createClient();
  const { data: n } = await supabase.from("newsletters").select("subject, body_html, audience, status").eq("id", id).maybeSingle();
  if (!n) return { error: "Save the newsletter first." };
  const row = n as { subject: string; body_html: string; audience: NewsletterAudience; status: string };
  if (row.status !== "draft") return { error: "This newsletter has already been sent." };
  const problem = readyToSend(row);
  if (problem) return { error: problem };
  const c = await countAudience(row.audience);
  if ("error" in c) return c;
  if (!c.count) return { error: "Nobody to send to — choose a group or add people." };
  const r = await callSender({ newsletter_id: id });
  revalidatePath("/admin/newsletters");
  revalidatePath(`/admin/newsletters/${id}`);
  if ("error" in r) return r;
  return { ok: true, recipients: (r as { recipients?: number }).recipients ?? c.count };
}
