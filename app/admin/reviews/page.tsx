import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Stars } from "@/components/ui/Stars";
import { DeleteReview } from "./DeleteReview";
import { dateShort } from "@/lib/format";
import type { Review } from "@/lib/database.types";

type Row = Review & {
  vendors: { name: string } | null;
  profiles: { full_name: string } | null;
};

export default async function AdminReviews() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data } = await supabase
    .from("reviews")
    .select("*, vendors:vendor_id(name), profiles:customer_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as unknown as Row[];
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;

  return (
    <AdminShell active="/admin/reviews" name={profile.full_name} role={profile.role}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Reviews</h1>
        <div className="flex items-center gap-2">
          <Stars value={avg} size={16} showValue count={rows.length} />
        </div>
      </div>
      <p className="mt-1 text-sm text-slate">Every customer review across the platform. Remove anything abusive.</p>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate">No reviews yet.</p>
        ) : rows.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Stars value={r.rating} size={14} />
                  <span className="text-sm font-medium text-ink">{r.vendors?.name ?? "—"}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate">
                  {r.profiles?.full_name ?? "Customer"} · {dateShort(r.created_at)}
                </p>
                {r.comment && <p className="mt-2 text-sm text-ink">“{r.comment}”</p>}
              </div>
              <DeleteReview id={r.id} />
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
