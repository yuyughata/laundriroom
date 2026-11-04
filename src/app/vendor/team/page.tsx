import { VendorShell } from "@/components/shells/VendorShell";
import { TeamManager } from "@/components/team/TeamManager";
import { getVendorContext } from "@/lib/vendor";
import { loadTeam } from "@/lib/teamData";

/** Vendor → Team: the main manager adds and manages staff. */
export default async function VendorTeamPage() {
  const ctx = await getVendorContext();
  const team = ctx.isManager ? await loadTeam(ctx.vendorId, ctx.profile.id) : [];
  const branches = ctx.branches.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }));

  return (
    <VendorShell active="/vendor/team" vendorName={ctx.vendorName} isManager={ctx.isManager}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Team</h1>
      </div>
      {ctx.isManager ? (
        <>
          <p className="mb-6 mt-1 text-sm text-slate">Add the people who work at {ctx.vendorName}, choose what they can do and where they work.</p>
          <TeamManager vendorId={ctx.vendorId} team={team} branches={branches} canManage />
        </>
      ) : (
        <p className="mt-3 rounded-card bg-ink/5 px-4 py-3 text-sm text-slate">Only the business&apos;s main manager can manage the team.</p>
      )}
    </VendorShell>
  );
}
