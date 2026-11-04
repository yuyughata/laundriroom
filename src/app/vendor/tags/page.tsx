import { VendorShell } from "@/components/shells/VendorShell";
import { TagManager } from "@/components/tags/TagManager";
import { getVendorContext } from "@/lib/vendor";
import { loadTagOverview, loadBatchTags } from "@/lib/tagData";

/** Vendor → Tags: generate, print and track the business's garment tags. */
export default async function VendorTags({ searchParams }: { searchParams: { batch?: string } }) {
  const ctx = await getVendorContext();
  const overview = await loadTagOverview(ctx.vendorId, ctx.vendorName);
  const batch = searchParams?.batch ? overview.batches.find((b) => b.id === searchParams.batch) ?? null : null;
  const batchTags = batch ? await loadBatchTags(batch.id) : undefined;

  return (
    <VendorShell active="/vendor/tags" vendorName={ctx.vendorName} isManager={ctx.isManager}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <h1 className="font-display text-2xl text-ink">Tags</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-slate">
        Garment tags for check-in: a QR code to scan and a code to type. Print them on A4, cut along the dashed lines and
        punch the ring to attach. {ctx.isManager ? "" : "Your main manager generates new tags; you can mark tags missing or damaged and reprint them."}
      </p>
      <TagManager vendorId={ctx.vendorId} vendorName={ctx.vendorName} overview={overview}
        canGenerate={ctx.isManager} batch={batch} batchTags={batchTags} basePath="/vendor/tags" />
    </VendorShell>
  );
}
