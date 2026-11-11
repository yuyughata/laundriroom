"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { isLegalDoc, type LegalDocSlug } from "@/lib/legalDocs";

/**
 * Legal document clauses (Privacy Policy / Terms of Use / Privacy Choices),
 * platform admins only (RLS enforces it too). Mirrors the Partner Agreement
 * editor, scoped per document (`doc`).
 */

function refresh(doc: LegalDocSlug) {
  revalidatePath("/admin/legal");
  revalidatePath(`/legal/${doc}`);
}

function clean(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").replace(/\r\n/g, "\n").trim();
  if (!title) return { error: "Give the section a title." } as const;
  if (!body) return { error: "Write the section text." } as const;
  if (title.length > 120) return { error: "Keep the title under 120 characters." } as const;
  if (body.length > 12000) return { error: "That section is too long (12,000 characters max)." } as const;
  return { title, body } as const;
}

function guardDoc(doc: string): asserts doc is LegalDocSlug {
  if (!isLegalDoc(doc)) throw new Error("Unknown legal document.");
}

export async function addClause(doc: string, formData: FormData) {
  await requireRole(["platform_admin"]);
  guardDoc(doc);
  const c = clean(formData);
  if ("error" in c) return c;
  const supabase = createClient();
  const { data: last } = await supabase.from("legal_clauses" as never)
    .select("position").eq("doc", doc).order("position", { ascending: false }).limit(1).maybeSingle();
  const position = Number((last as { position?: number } | null)?.position ?? 0) + 1;
  const { error } = await supabase.from("legal_clauses" as never).insert({ doc, position, ...c } as never);
  if (error) return { error: error.message };
  refresh(doc);
  return { ok: true };
}

export async function updateClause(doc: string, id: string, formData: FormData) {
  await requireRole(["platform_admin"]);
  guardDoc(doc);
  const c = clean(formData);
  if ("error" in c) return c;
  const supabase = createClient();
  const { error } = await supabase.from("legal_clauses" as never).update(c as never).eq("id", id).eq("doc", doc);
  if (error) return { error: error.message };
  refresh(doc);
  return { ok: true };
}

export async function setClauseActive(doc: string, id: string, active: boolean) {
  await requireRole(["platform_admin"]);
  guardDoc(doc);
  const supabase = createClient();
  if (!active) {
    const { count } = await supabase.from("legal_clauses" as never)
      .select("id", { count: "exact", head: true }).eq("doc", doc).eq("active", true);
    if ((count ?? 0) <= 1) return { error: "This page needs at least one visible section." };
  }
  const { error } = await supabase.from("legal_clauses" as never).update({ active } as never).eq("id", id).eq("doc", doc);
  if (error) return { error: error.message };
  refresh(doc);
  return { ok: true };
}

export async function deleteClause(doc: string, id: string) {
  await requireRole(["platform_admin"]);
  guardDoc(doc);
  const supabase = createClient();
  const { count } = await supabase.from("legal_clauses" as never)
    .select("id", { count: "exact", head: true }).eq("doc", doc).eq("active", true).neq("id", id);
  if ((count ?? 0) < 1) return { error: "This page needs at least one visible section." };
  const { error } = await supabase.from("legal_clauses" as never).delete().eq("id", id).eq("doc", doc);
  if (error) return { error: error.message };
  refresh(doc);
  return { ok: true };
}

/** Move a section one place up or down within its document. */
export async function moveClause(doc: string, id: string, dir: -1 | 1) {
  await requireRole(["platform_admin"]);
  guardDoc(doc);
  const supabase = createClient();
  const { data } = await supabase.from("legal_clauses" as never).select("id, position").eq("doc", doc).order("position");
  const rows = (data ?? []) as { id: string; position: number }[];
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].position !== k + 1) {
      const { error } = await supabase.from("legal_clauses" as never).update({ position: k + 1 } as never).eq("id", rows[k].id);
      if (error) return { error: error.message };
    }
  }
  refresh(doc);
  return { ok: true };
}
