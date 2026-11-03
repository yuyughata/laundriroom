import { createClient } from "@/lib/supabase/server";
import { DEFAULT_AGREEMENT, toParagraphs, type AgreementClause } from "@/lib/legal";

/**
 * The current Partner Agreement (active clauses in order) and when it last
 * changed. Readable signed out, for the public /apply page. Falls back to the
 * default clause if nothing is stored yet.
 */
export async function getPartnerAgreement(): Promise<{ clauses: AgreementClause[]; updatedAt: string | null }> {
  try {
    const supabase = createClient();
    const [{ data: rows }, { data: settings }] = await Promise.all([
      supabase.from("agreement_clauses" as never).select("id, title, body, position").eq("active", true).order("position"),
      supabase.from("platform_settings").select("agreement_updated_at").eq("id", true).maybeSingle(),
    ]);
    const clauses = ((rows ?? []) as { id: string; title: string; body: string }[])
      .map((r) => ({ id: r.id, title: r.title, paragraphs: toParagraphs(r.body) }))
      .filter((c) => c.paragraphs.length > 0);
    return {
      clauses: clauses.length ? clauses : DEFAULT_AGREEMENT,
      updatedAt: (settings as { agreement_updated_at?: string } | null)?.agreement_updated_at ?? null,
    };
  } catch {
    return { clauses: DEFAULT_AGREEMENT, updatedAt: null };
  }
}
