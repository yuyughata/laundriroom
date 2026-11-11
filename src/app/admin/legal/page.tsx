import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { LEGAL_DOCS, isLegalDoc, legalDocMeta, type LegalDocSlug } from "@/lib/legalDocs";
import { LegalClauseEditor, NewLegalClause, type ClauseRow } from "./LegalClauseEditor";

/** Admin → Legal pages: edit the public Privacy Policy, Terms of Use and Privacy Choices. */
export default async function AdminLegal({ searchParams }: { searchParams: { doc?: string } }) {
  const profile = await requireRole(["platform_admin"]);
  const doc: LegalDocSlug = isLegalDoc(searchParams.doc ?? "") ? (searchParams.doc as LegalDocSlug) : "privacy";
  const meta = legalDocMeta(doc);
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("legal_clauses" as never)
    .select("id, position, title, body, active, updated_at")
    .eq("doc", doc).order("position");
  const clauses = (rows ?? []) as ClauseRow[];
  const missingTable = !!error && clauses.length === 0;
  const lastChanged = clauses.reduce<string | null>((max, c) => (!max || c.updated_at > max ? c.updated_at : max), null);

  return (
    <AdminShell active="/admin/legal" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Legal pages</h1>
        <a href={`/legal/${doc}`} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-2 text-xs">
          View {meta.title} ↗
        </a>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        The public pages linked in the website footer. Add, edit, reorder or hide sections —
        separate paragraphs with a blank line. Changes go live immediately.
      </p>

      {/* Document tabs */}
      <div className="mt-5 flex flex-wrap gap-2">
        {LEGAL_DOCS.map((d) => (
          <Link key={d.slug} href={`/admin/legal?doc=${d.slug}`}
            className={`rounded-pill px-3 py-1.5 text-xs ${
              d.slug === doc ? "bg-ink text-ivory" : "bg-white text-ink border border-ink/15 hover:bg-ink/5"}`}>
            {d.title}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-ink">{meta.title}</h2>
        {lastChanged && <span className="text-xs text-slate">Last changed {dateTime(lastChanged)}</span>}
      </div>
      <p className="max-w-3xl text-sm text-slate">{meta.intro}</p>

      {missingTable ? (
        <p className="mt-6 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">
          Legal pages can&apos;t be edited until database migration 0052 is applied.
        </p>
      ) : (
        <div className="mt-6 max-w-3xl space-y-4">
          {clauses.map((c, i) => (
            <LegalClauseEditor key={c.id} doc={doc} clause={c} index={i} isFirst={i === 0} isLast={i === clauses.length - 1} />
          ))}
          {clauses.length === 0 && <p className="text-sm text-slate">No sections yet — add the first one below.</p>}
          <NewLegalClause doc={doc} />
        </div>
      )}
    </AdminShell>
  );
}
