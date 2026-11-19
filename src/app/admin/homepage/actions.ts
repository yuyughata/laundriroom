"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { HOMEPAGE_FIELDS } from "@/lib/homepageContent";

/**
 * Save homepage copy overrides (platform admins only; RLS enforces it too).
 * A field left at its default (or blank) is stored as no row, so the page
 * falls back to the built-in copy — keeping the table to only what changed.
 */
export async function saveHomepageContent(formData: FormData) {
  const profile = await requireRole(["platform_admin"]);
  const supabase = createClient();

  const toUpsert: { key: string; value: string; updated_by: string; updated_at: string }[] = [];
  const toDelete: string[] = [];
  const now = new Date().toISOString();

  for (const f of HOMEPAGE_FIELDS) {
    const raw = String(formData.get(f.key) ?? "").replace(/\r\n/g, "\n").trim();
    if (raw && raw !== f.default) {
      if (raw.length > 4000) return { error: `"${f.label}" is too long (4000 characters max).` };
      toUpsert.push({ key: f.key, value: raw, updated_by: profile.id, updated_at: now });
    } else {
      toDelete.push(f.key);
    }
  }

  if (toUpsert.length) {
    const { error } = await supabase.from("homepage_content" as never)
      .upsert(toUpsert as never, { onConflict: "key" } as never);
    if (error) return { error: error.message };
  }
  if (toDelete.length) {
    const { error } = await supabase.from("homepage_content" as never).delete().in("key", toDelete);
    if (error) return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/admin/homepage");
  return { ok: true };
}

/** Clear every override — the homepage reverts entirely to its built-in copy. */
export async function resetHomepageContent() {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("homepage_content" as never)
    .delete().not("key", "is", null);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  return { ok: true };
}

// ─────────────────────────── Custom sections ───────────────────────────────

function refreshHome() {
  revalidatePath("/");
  revalidatePath("/admin/homepage");
}

type SectionRow = {
  id: string; position: number; eyebrow: string | null; heading: string;
  body: string | null; cta_label: string | null; cta_href: string | null;
  tone: string; active: boolean;
};

async function nextPosition(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("homepage_sections" as never)
    .select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  return Number((data as { position?: number } | null)?.position ?? 0) + 1;
}

/** Add a fresh, blank-ish section the admin then fills in. */
export async function addSection() {
  const profile = await requireRole(["platform_admin"]);
  const supabase = createClient();
  const position = await nextPosition(supabase);
  const { error } = await supabase.from("homepage_sections" as never).insert({
    position, heading: "New section", tone: "light", active: true, created_by: profile.id,
  } as never);
  if (error) return { error: error.message };
  refreshHome();
  return { ok: true };
}

/** Duplicate an existing section (placed right after the original). */
export async function duplicateSection(id: string) {
  const profile = await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { data: src } = await supabase.from("homepage_sections" as never)
    .select("*").eq("id", id).maybeSingle();
  const s = src as SectionRow | null;
  if (!s) return { error: "Section not found." };
  // Make room after the original, then insert the copy there.
  const { data: rows } = await supabase.from("homepage_sections" as never).select("id, position").order("position");
  const ordered = (rows ?? []) as { id: string; position: number }[];
  let pos = s.position + 1;
  for (const r of ordered) {
    if (r.position >= pos) {
      await supabase.from("homepage_sections" as never).update({ position: r.position + 1 } as never).eq("id", r.id);
    }
  }
  const { error } = await supabase.from("homepage_sections" as never).insert({
    position: pos, eyebrow: s.eyebrow, heading: `${s.heading} (copy)`, body: s.body,
    cta_label: s.cta_label, cta_href: s.cta_href, tone: s.tone, active: s.active, created_by: profile.id,
  } as never);
  if (error) return { error: error.message };
  refreshHome();
  return { ok: true };
}

export async function updateSection(id: string, formData: FormData) {
  await requireRole(["platform_admin"]);
  const heading = String(formData.get("heading") || "").trim();
  if (!heading) return { error: "Give the section a heading." };
  const tone = String(formData.get("tone") || "light") === "dark" ? "dark" : "light";
  const field = (k: string) => {
    const v = String(formData.get(k) || "").replace(/\r\n/g, "\n").trim();
    return v ? v : null;
  };
  const supabase = createClient();
  const { error } = await supabase.from("homepage_sections" as never).update({
    eyebrow: field("eyebrow"), heading, body: field("body"),
    cta_label: field("cta_label"), cta_href: field("cta_href"), tone,
    updated_at: new Date().toISOString(),
  } as never).eq("id", id);
  if (error) return { error: error.message };
  refreshHome();
  return { ok: true };
}

export async function setSectionActive(id: string, active: boolean) {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("homepage_sections" as never).update({ active } as never).eq("id", id);
  if (error) return { error: error.message };
  refreshHome();
  return { ok: true };
}

export async function deleteSection(id: string) {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("homepage_sections" as never).delete().eq("id", id);
  if (error) return { error: error.message };
  refreshHome();
  return { ok: true };
}

/** Move a section one place up or down. */
export async function moveSection(id: string, dir: -1 | 1) {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { data } = await supabase.from("homepage_sections" as never).select("id, position").order("position");
  const rows = (data ?? []) as { id: string; position: number }[];
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].position !== k + 1) {
      const { error } = await supabase.from("homepage_sections" as never).update({ position: k + 1 } as never).eq("id", rows[k].id);
      if (error) return { error: error.message };
    }
  }
  refreshHome();
  return { ok: true };
}
