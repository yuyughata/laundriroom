import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shells/AdminShell";
import { BranchManager } from "@/components/branches/BranchManager";
import { TeamManager } from "@/components/team/TeamManager";
import { loadTeam } from "@/lib/teamData";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadBranches, loadStaff } from "@/lib/branchData";
import { mapsConfigured } from "@/lib/maps";
import { dateShort } from "@/lib/format";
import { VendorActions } from "../VendorActions";
import type { Vendor } from "@/lib/database.types";

/** Admin → Vendors → one vendor: its branches and staff, managed on the vendor's behalf. */
export default async function AdminVendorDetail({ params }: { params: { id: string } }) {
  const profile = await requireRole(["platform_admin", "support_agent"]);
  const supabase = createClient();
  const { data } = await supabase.from("vendors").select("*").eq("id", params.id).maybeSingle();
  const v = data as Vendor | null;
  if (!v) notFound();

  const isAdmin = profile.role === "platform_admin";
  const [branches, staff, team] = await Promise.all([loadBranches(v.id), loadStaff(v.id), loadTeam(v.id, profile.id)]);

  return (
    <AdminShell active="/admin/vendors" name={profile.full_name} role={profile.role}>
      <Link href="/admin/vendors" className="text-sm text-slate hover:text-ink">← Vendors</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">{v.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={v.status === "verified" ? "chip-ok" : v.status === "pending" ? "chip-warn" : "chip-muted"}>{v.status}</span>
          {v.kyc_verified && <span className="chip-ok">KYC verified</span>}
          {v.slug && (v.status === "verified" || v.status === "pending") && (
            <a href={`/v/${v.slug}`} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-xs">Public page</a>
          )}
        </div>
      </div>
      {isAdmin && (
        <div className="mt-3">
          <VendorActions vendorId={v.id} vendorName={v.name} status={v.status} afterDelete="/admin/vendors" />
        </div>
      )}
      <p className="mt-1 text-sm text-slate">
        On laundriroom since {dateShort(v.created_at)} · {branches.filter((b) => b.active).length} active branch
        {branches.filter((b) => b.active).length === 1 ? "" : "es"} · {staff.length} staff
      </p>

      <h2 className="mt-8 font-display text-lg text-ink">Branches</h2>
      <p className="mb-4 text-xs text-slate">
        {isAdmin
          ? "Add or edit branches on the vendor's behalf. The vendor's main manager can do the same from their dashboard."
          : "Only platform admins can change branches."}
      </p>
      {branches.length === 0 ? (
        <p className="rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">Branches need database migration 0033.</p>
      ) : (
        <BranchManager vendorId={v.id} branches={branches} staff={staff} canManage={isAdmin} mapsOn={mapsConfigured()} />
      )}

      <h2 className="mt-10 font-display text-lg text-ink">Team</h2>
      <p className="mb-4 text-xs text-slate">
        {isAdmin
          ? "Add staff, change roles and branches, or send a login link on the vendor's behalf. Their main manager can do the same at Vendor → Team."
          : "Only platform admins can change a vendor's team."}
      </p>
      <TeamManager vendorId={v.id} team={team}
        branches={branches.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }))}
        canManage={isAdmin} forAdmin />
    </AdminShell>
  );
}
