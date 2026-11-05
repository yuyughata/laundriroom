"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

/**
 * Partner Agreement clauses (platform admins only; RLS enforces it too).
 * Any change moves platform_settings.agreement_updated_at, so vendors who
 * accepted an older version are asked to accept again.
 */

function refresh() {
  revalidatePath("/admin/agreement");
  revalidatePath("/apply");
  revalidatePath("/vendor/verification");
  revalidatePath("/admin/verification");
}

function clean(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").replace(/\r\n/g, "\n").trim();
  if (!title) return { error: "Give the clause a title." } as const;
  if (!body) return { error: "Write the clause text." } as const;
  if (title.length > 120) return { error: "Keep the title under 120 characters." } as const;
  if (body.length > 8000) return { error: "That clause is too long (8,000 characters max)." } as const;
  return { title, body } as const;
}

export async function addClause(formData: FormData) {
  await requireRole(["platform_admin"]);
  const c = clean(formData);
  if ("error" in c) return c;
  const supabase = createClient();
  const { data: last } = await supabase.from("agreement_clauses" as never)
    .select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const position = Number((last as { position?: number } | null)?.position ?? 0) + 1;
  const { error } = await supabase.from("agreement_clauses" as never).insert({ ...c, position } as never);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function updateClause(id: string, formData: FormData) {
  await requireRole(["platform_admin"]);
  const c = clean(formData);
  if ("error" in c) return c;
  const supabase = createClient();
  const { error } = await supabase.from("agreement_clauses" as never).update(c as never).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function setClauseActive(id: string, active: boolean) {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  if (!active) {
    const { count } = await supabase.from("agreement_clauses" as never)
      .select("id", { count: "exact", head: true }).eq("active", true);
    if ((count ?? 0) <= 1) return { error: "The agreement needs at least one clause." };
  }
  const { error } = await supabase.from("agreement_clauses" as never).update({ active } as never).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteClause(id: string) {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { count } = await supabase.from("agreement_clauses" as never)
    .select("id", { count: "exact", head: true }).eq("active", true).neq("id", id);
  if ((count ?? 0) < 1) return { error: "The agreement needs at least one active clause." };
  const { error } = await supabase.from("agreement_clauses" as never).delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

/** Move a clause one place up or down. */
export async function moveClause(id: string, dir: -1 | 1) {
  await requireRole(["platform_admin"]);
  const supabase = createClient();
  const { data } = await supabase.from("agreement_clauses" as never).select("id, position").order("position");
  const rows = (data ?? []) as { id: string; position: number }[];
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].position !== k + 1) {
      const { error } = await supabase.from("agreement_clauses" as never).update({ position: k + 1 } as never).eq("id", rows[k].id);
      if (error) return { error: error.message };
    }
  }
  refresh();
  return { ok: true };
}
