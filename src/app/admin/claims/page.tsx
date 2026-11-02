import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateShort } from "@/lib/format";
import type { Claim, ClaimStatus } from "@/lib/database.types";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "investigating", label: "Investigating" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "resolved", label: "Resolved" },
];
const chip = (s: ClaimStatus) =>
  s === "resolved" || s === "approved" ? "chip-ok" : s === "rejected" ? "chip-muted" : "chip-warn";

type Row = Claim & { vendors: { name: string } | null; profiles: { full_name: string } | null };

export default async function AdminClaims({ searchParams }: { searchParams: { status?: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();
  const filter = searchParams.status ?? "all";

  let query = supabase.from("claims")
    .select("*, vendors:vendor_id(name), profiles:customer_id(full_name)")
    .order("created_at", { ascending: false }).limit(300);
  if (filter !== "all") query = query.eq("status", filter as ClaimStatus);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const openCount = rows.filter((r) => ["open", "investigating"].includes(r.status)).length;

  return (
    <AdminShell active="/admin/claims" name={profile.full_name} role={profile.role}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Claims & lost items</h1>
        <span className="chip-warn">{openCount} open</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === "all" ? "/admin/claims" : `/admin/claims?status=${f.key}`}
            className={`rounded-pill px-3 py-1.5 text-xs ${
              filter === f.key ? "bg-ink text-ivory" : "bg-white text-ink border border-ink/15 hover:bg-ink/5"}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">#</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3">Opened</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-ink/5">
                <td className="px-4 py-3 font-medium text-ink"><Link href={`/admin/claims/${r.id}`} className="block">#{r.number}</Link></td>
                <td className="px-4 py-3 text-slate">{r.type === "loss" ? "Lost item" : "Damage"}</td>
                <td className="px-4 py-3 text-slate">{r.vendors?.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate">{r.profiles?.full_name ?? "—"}</td>
                <td className="px-4 py-3"><span className={chip(r.status)}>{r.status}</span></td>
                <td className="px-4 py-3 text-slate">{dateShort(r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate">No claims.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
