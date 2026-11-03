import { VendorShell } from "@/components/shells/VendorShell";
import { BranchManager } from "@/components/branches/BranchManager";
import { getVendorContext } from "@/lib/vendor";
import { loadBranches, loadStaff } from "@/lib/branchData";
import { mapsConfigured } from "@/lib/maps";

/**
 * Vendor → Branches: the business's shop locations. The business-wide
 * manager adds and edits branches and puts staff at a branch; everyone else
 * sees their branch.
 */
export default async function VendorBranches() {
  const ctx = await getVendorContext();
  const all = await loadBranches(ctx.vendorId);
  const branches = ctx.branchId ? all.filter((b) => b.id === ctx.branchId) : all;
  const staff = ctx.isManager ? await loadStaff(ctx.vendorId, ctx.profile.id) : undefined;

  return (
    <VendorShell active="/vendor/branches" vendorName={ctx.vendorName}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <h1 className="font-display text-2xl text-ink">Branches</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        {ctx.isManager
          ? "Each shop location of your business. Customers choose a branch when they order, and your public page lists every branch. All branches share your price list and payout account."
          : "The branch you work at. Your manager adds branches and decides who works where."}
      </p>
      {all.length === 0 ? (
        <p className="mt-6 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">
          Branches aren&apos;t switched on yet. Please contact laundriroom support.
        </p>
      ) : (
        <div className="mt-6">
          <BranchManager vendorId={ctx.vendorId} branches={branches} staff={staff}
            canManage={ctx.isManager} mapsOn={mapsConfigured()} />
        </div>
      )}
    </VendorShell>
  );
}
