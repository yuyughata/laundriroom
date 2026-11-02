import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VendorActions } from "./VendorActions";
import { NewVendor } from "./NewVendor";
import { Stars } from "@/components/ui/Stars";
import { dateShort } from "@/lib/format";
import Link from "next/link";
import type { Vendor, VendorRating } from "@/lib/database.types";

const STATUS_CHIP: Record<string, string> = {
  verified: "chip-ok", pending: "chip-warn", suspended: "chip-muted", rejected: "chip-muted",
};

export default async function AdminVendors() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: vendors }, { data: plan }, { data: settings }, { data: ratings }] = await Promise.all([
    supabase.from("vendors").select("*").order("created_at", { ascending: false }),
    supabase.from("vendor_plans").select("commission_rate").eq("is_default", true).limit(1).maybeSingle(),
    supabase.from("platform_settings").select("express_pct, premium_pct").eq("id", true).maybeSingle(),
    supabase.from("vendor_ratings").select("*"),
  ]);

  const vs = (vendors ?? []) as Vendor[];
  const ratingMap = new Map(((ratings ?? []) as VendorRating[]).map((r) => [r.vendor_id, r]));
  const st = settings as { express_pct?: number; premium_pct?: number } | null;
  const def = {
    c: Number((plan as { commission_rate?: number } | null)?.commission_rate ?? 0),
    e: Number(st?.express_pct ?? 0), p: Number(st?.premium_pct ?? 0),
  };
  const fmt = (n: number) => `${Math.round(n * 10000) / 100}%`;
  const rates = (v: Vendor) => ({
    c: v.commission_rate_override ?? def.c, e: v.express_pct_override ?? def.e, p: v.premium_pct_override ?? def.p,
    custom: v.commission_rate_override != null || v.express_pct_override != null || v.premium_pct_override != null,
  });

  return (
    <AdminShell active="/admin/vendors" name={profile.full_name} role={profile.role}>
      <div className="relative flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Vendors</h1>
        <div className="flex items-center gap-3 text-xs">
          <span className="chip-ok">{vs.filter((v) => v.status === "verified").length} verified</span>
          <span className="chip-warn">{vs.filter((v) => v.status === "pending").length} pending</span>
          <NewVendor />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Delivery</th>
              <th className="px-4 py-3">Rates</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {vs.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 font-medium text-ink">{v.name}</td>
                <td className="px-4 py-3 text-slate">{[v.area, v.city].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-4 py-3 text-slate">{v.delivery.replace("_", " ")}</td>
                <td className="px-4 py-3 text-xs text-slate">
                  {(() => { const r = rates(v); return (
                    <Link href="/admin/fees#vendor-rates" className="block hover:text-ink">
                      <span className="text-ink">{fmt(r.c)}</span> commission
                      <span className="block">{fmt(r.e)} express · {fmt(r.p)} premium</span>
                      {r.custom && <span className="chip-ink mt-1 inline-block">Custom</span>}
                    </Link>
                  ); })()}
                </td>
                <td className="px-4 py-3">
                  {ratingMap.get(v.id)
                    ? <Stars value={Number(ratingMap.get(v.id)!.avg_rating)} size={13} showValue count={ratingMap.get(v.id)!.review_count} />
                    : <span className="text-xs text-slate">—</span>}
                </td>
                <td className="px-4 py-3"><span className={STATUS_CHIP[v.status]}>{v.status}</span></td>
                <td className="px-4 py-3 text-slate">{dateShort(v.created_at)}</td>
                <td className="px-4 py-3">
                  <VendorActions vendorId={v.id} status={v.status} />
                </td>
              </tr>
            ))}
            {vs.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate">No vendors yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
