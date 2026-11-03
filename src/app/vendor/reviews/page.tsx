import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { Stars } from "@/components/ui/Stars";
import { dateShort } from "@/lib/format";
import type { Review, VendorRating } from "@/lib/database.types";
import { QualityNotice, type OpenStep } from "./QualityNotice";

export default async function VendorReviews() {
  const ctx = await getVendorContext();
  const supabase = createClient();

  const [{ data: reviews }, { data: rating }, { data: steps }] = await Promise.all([
    supabase.from("reviews").select("*").eq("vendor_id", ctx.vendorId).order("created_at", { ascending: false }).limit(200),
    supabase.from("vendor_ratings").select("*").eq("vendor_id", ctx.vendorId).maybeSingle(),
    supabase.from("vendor_quality_actions" as never).select("*").eq("vendor_id", ctx.vendorId)
      .order("created_at", { ascending: false }).limit(1),
  ]);
  // The latest step from laundriroom, if a case is open (not resolved).
  const latest = ((steps ?? []) as (OpenStep | { stage: "resolved" })[])[0];
  const openStep = latest && latest.stage !== "resolved" ? (latest as OpenStep) : null;

  const list = (reviews ?? []) as Review[];
  const agg = rating as VendorRating | null;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: list.filter((r) => r.rating === n).length }));

  return (
    <VendorShell active="/vendor/reviews" vendorName={ctx.vendorName}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <h1 className="font-display text-2xl text-ink">Reviews</h1>
      {openStep && <QualityNotice step={openStep} canRespond={ctx.isManager} />}

      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="card px-6 py-5 text-center">
          <p className="font-display text-4xl text-ink">{agg ? Number(agg.avg_rating).toFixed(1) : "—"}</p>
          <div className="mt-1 flex justify-center"><Stars value={agg ? Number(agg.avg_rating) : 0} size={16} /></div>
          <p className="mt-1 text-xs text-slate">{agg?.review_count ?? 0} review{(agg?.review_count ?? 0) === 1 ? "" : "s"}</p>
        </div>
        <div className="card p-4">
          {dist.map((d) => {
            const pct = list.length ? Math.round((d.c / list.length) * 100) : 0;
            return (
              <div key={d.n} className="flex items-center gap-3 py-1 text-xs">
                <span className="w-6 text-slate">{d.n}★</span>
                <div className="h-2 flex-1 rounded-pill bg-ink/10">
                  <div className="h-2 rounded-pill bg-champagne" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right text-slate">{d.c}</span>
              </div>
            );
          })}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg text-ink">What customers said</h2>
        {list.length === 0 ? (
          <p className="mt-2 text-sm text-slate">No reviews yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {list.map((r) => (
              <div key={r.id} className={`card p-4 ${r.rating <= 2 ? "border-warn/40" : ""}`}>
                <div className="flex items-center justify-between">
                  <Stars value={r.rating} size={15} />
                  <span className="text-xs text-slate">{dateShort(r.created_at)}</span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-ink">“{r.comment}”</p>}
                {r.rating <= 2 && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ink/5 pt-2 text-xs">
                    <span className="text-warn">Low rating: contact the customer and put it right.</span>
                    <a href={`/vendor/orders/${r.order_id}`} className="font-medium text-ink underline">Open the order</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </VendorShell>
  );
}
