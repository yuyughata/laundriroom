import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Stars } from "@/components/ui/Stars";
import { dateShort, dateTime } from "@/lib/format";
import { QualityActions, type CaseStep } from "./QualityActions";

type Row = {
  vendor_id: string; vendor_name: string; vendor_status: string;
  reviews_30: number; bad_30: number; bad_prev_30: number; bad_90: number;
  avg_30: number | null; avg_all: number | null; reviews_all: number; last_bad_at: string | null;
  level: "flagged" | "watch" | "ok"; reason: string; stage: string | null; stage_at: string | null; vendor_responded: boolean;
};

const STAGE_LABEL: Record<string, string> = {
  inquiry: "Inquiry sent", warning: "Warned", suspension: "Suspended", resolved: "Resolved",
};

/**
 * Admin → Vendor quality: vendors with bad (1–2★) reviews. "Flagged" vendors
 * have rising or repeated bad reviews; admins take the steps in order —
 * inquiry, then warning, then suspension — or resolve the case.
 */
export default async function AdminQuality() {
  const profile = await requireRole(["platform_admin", "support_agent"]);
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_review_watchlist" as never);
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.vendor_id);

  const [{ data: actions }, { data: bad }] = ids.length ? await Promise.all([
    supabase.from("vendor_quality_actions" as never).select("*").in("vendor_id", ids).order("created_at", { ascending: false }),
    supabase.from("reviews").select("vendor_id, rating, comment, created_at, order_id")
      .in("vendor_id", ids).lte("rating", 2).order("created_at", { ascending: false }).limit(200),
  ]) : [{ data: [] }, { data: [] }];
  const steps = (actions ?? []) as (CaseStep & { vendor_id: string })[];
  const badReviews = (bad ?? []) as { vendor_id: string; rating: number; comment: string | null; created_at: string }[];
  const flagged = rows.filter((r) => r.level === "flagged").length;

  return (
    <AdminShell active="/admin/quality" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Vendor quality</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={flagged ? "chip-warn" : "chip-ok"}>{flagged} flagged</span>
          <span className="chip-muted">{rows.length - flagged} watching</span>
        </div>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        Vendors with 1–2★ reviews. Each bad review already emails the vendor asking them to contact the customer and put
        it right. <strong className="text-ink">Flagged</strong> means bad reviews are repeating or rising (3+ in 30 days,
        more than the 30 days before, or 30%+ of recent reviews). Take the steps in order: <strong className="text-ink">inquiry</strong> to
        understand why, a <strong className="text-ink">warning</strong> if it continues, then <strong className="text-ink">suspension</strong>.
      </p>

      {error ? (
        <p className="mt-6 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">This page needs database migration 0038.</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-card bg-teal/10 px-4 py-3 text-sm text-teal">No vendors with bad reviews in the last 30 days.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((r) => {
            const vSteps = steps.filter((s) => s.vendor_id === r.vendor_id);
            const vBad = badReviews.filter((b) => b.vendor_id === r.vendor_id).slice(0, 3);
            return (
              <section key={r.vendor_id} className={`card p-5 ${r.level === "flagged" ? "border-warn/40" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/vendors/${r.vendor_id}`} className="font-display text-lg text-ink underline decoration-ink/20 hover:decoration-ink">
                        {r.vendor_name}
                      </Link>
                      <span className={r.level === "flagged" ? "chip-warn" : "chip-muted"}>{r.level === "flagged" ? "Flagged" : "Watching"}</span>
                      {r.stage && r.stage !== "resolved" && <span className="chip-ink">{STAGE_LABEL[r.stage]}{r.stage_at ? ` · ${dateShort(r.stage_at)}` : ""}</span>}
                      {r.vendor_status === "suspended" && <span className="chip-muted">Vendor suspended</span>}
                    </div>
                    <p className="mt-1 text-sm text-ink">{r.reason}</p>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-5 gap-y-1 text-xs">
                    <dt className="text-slate">Bad · 30d</dt><dt className="text-slate">Before</dt><dt className="text-slate">Avg · 30d</dt>
                    <dd className="font-medium text-ink">{r.bad_30}</dd>
                    <dd className="text-ink">{r.bad_prev_30}</dd>
                    <dd className="text-ink">{r.avg_30 != null ? Number(r.avg_30).toFixed(1) : "—"} <span className="text-slate">({r.reviews_30})</span></dd>
                  </dl>
                </div>

                {vBad.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {vBad.map((b, i) => (
                      <li key={i} className="rounded-card bg-ivory/70 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate">
                          <Stars value={b.rating} size={12} /> {dateShort(b.created_at)}
                        </div>
                        {b.comment && <p className="mt-1 text-ink/80">“{b.comment}”</p>}
                      </li>
                    ))}
                  </ul>
                )}

                {vSteps.length > 0 && (
                  <ol className="mt-4 space-y-2 border-l-2 border-ink/10 pl-4 text-sm">
                    {vSteps.map((s) => (
                      <li key={s.id}>
                        <p className="text-xs text-slate">{STAGE_LABEL[s.stage]} · {dateTime(s.created_at)}</p>
                        <p className="text-ink">{s.message}</p>
                        {s.vendor_response && (
                          <p className="mt-1 rounded-card bg-teal/10 px-3 py-2 text-xs text-ink">
                            <span className="font-medium">Vendor replied{s.responded_at ? ` ${dateShort(s.responded_at)}` : ""}:</span> {s.vendor_response}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}

                {profile.role === "platform_admin" && (
                  <QualityActions vendorId={r.vendor_id} vendorName={r.vendor_name} steps={vSteps} badCount={r.bad_30} />
                )}
              </section>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
