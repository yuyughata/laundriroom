import { AdminShell } from "@/components/shells/AdminShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { DEFAULT_AGREEMENT, PARTNER_AGREEMENT_TITLE } from "@/lib/legal";
import { ClauseEditor, NewClause, type ClauseRow } from "./ClauseEditor";

/** Admin → Partner agreement: the clauses vendors accept at /apply and in-app. */
export default async function AdminAgreement() {
  const profile = await requireRole(["platform_admin"]);
  const supabase = createClient();
  const [{ data: rows, error }, { data: settings }, { count: vendorsTotal }, { data: accepted }] = await Promise.all([
    supabase.from("agreement_clauses" as never).select("id, position, title, body, active, updated_at").order("position"),
    supabase.from("platform_settings").select("agreement_updated_at").eq("id", true).maybeSingle(),
    supabase.from("vendors").select("id", { count: "exact", head: true }).in("status", ["verified", "pending"]),
    supabase.from("vendors").select("terms_accepted_at").in("status", ["verified", "pending"]).not("terms_accepted_at", "is", null),
  ]);
  const clauses = (rows ?? []) as ClauseRow[];
  const updatedAt = (settings as { agreement_updated_at?: string } | null)?.agreement_updated_at ?? null;
  const current = ((accepted ?? []) as { terms_accepted_at: string }[])
    .filter((v) => !updatedAt || new Date(v.terms_accepted_at) >= new Date(updatedAt)).length;
  const missingTable = !!error && clauses.length === 0;

  return (
    <AdminShell active="/admin/agreement" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">{PARTNER_AGREEMENT_TITLE}</h1>
        <span className="chip-muted">{current} of {vendorsTotal ?? 0} vendors on the current version</span>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        The terms every partner accepts when they apply (<span className="text-ink">/apply</span>) and again in their
        dashboard (Vendor → Verification). Add, edit, reorder or switch off clauses. Separate paragraphs with a blank
        line. Any change counts as a new version: vendors who accepted an older one are asked to accept again.
        {updatedAt && <> Last changed {dateTime(updatedAt)}.</>}
      </p>

      {missingTable ? (
        <p className="mt-6 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">
          The agreement can&apos;t be edited until database migration 0034 is applied. Vendors currently see the default
          clause: {DEFAULT_AGREEMENT[0].title}.
        </p>
      ) : (
        <div className="mt-6 max-w-3xl space-y-4">
          {clauses.map((c, i) => (
            <ClauseEditor key={c.id} clause={c} index={i} isFirst={i === 0} isLast={i === clauses.length - 1} />
          ))}
          <NewClause />
        </div>
      )}
    </AdminShell>
  );
}
