import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { TagManager } from "@/components/tags/TagManager";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadTagOverview, loadBatchTags } from "@/lib/tagData";

/** Admin → Tags: generate and print tags on a vendor's behalf, and see their history. */
export default async function AdminTags({ searchParams }: { searchParams: { vendor?: string; batch?: string } }) {
  const profile = await requireRole(["platform_admin", "support_agent"]);
  const supabase = createClient();
  const { data: vs } = await supabase.from("vendors").select("id, name, status").in("status", ["verified", "pending"]).order("name");
  const vendors = (vs ?? []) as { id: string; name: string; status: string }[];
  const vendor = vendors.find((v) => v.id === searchParams?.vendor) ?? null;
  const overview = vendor ? await loadTagOverview(vendor.id, vendor.name) : null;
  const batch = vendor && overview && searchParams?.batch ? overview.batches.find((b) => b.id === searchParams.batch) ?? null : null;
  const batchTags = batch ? await loadBatchTags(batch.id) : undefined;

  return (
    <AdminShell active="/admin/tags" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Tags</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        Generate and print QR tags for a vendor, and see each vendor&apos;s tag history, missing and damaged tags.
      </p>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Choose a vendor">
        {vendors.map((v) => (
          <Link key={v.id} href={`/admin/tags?vendor=${v.id}`} className={vendor?.id === v.id ? "chip-ink" : "chip-muted"}>{v.name}</Link>
        ))}
        {vendors.length === 0 && <span className="text-sm text-slate">No active vendors yet.</span>}
      </nav>
      {vendor && overview ? (
        <div className="mt-6">
          <TagManager vendorId={vendor.id} vendorName={vendor.name} overview={overview}
            canGenerate={profile.role === "platform_admin"} batch={batch} batchTags={batchTags}
            basePath={`/admin/tags?vendor=${vendor.id}`} />
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate">Choose a vendor above.</p>
      )}
    </AdminShell>
  );
}
