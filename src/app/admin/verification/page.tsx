import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DocReview, KycToggle } from "./ReviewActions";
import { dateShort } from "@/lib/format";
import type { VendorDocument, VendorDocType } from "@/lib/database.types";

const DOC_LABEL: Record<VendorDocType, string> = {
  id: "Government ID", cac: "CAC certificate", other: "Other",
};
const STATUS_CHIP: Record<string, string> = {
  pending: "chip-warn", approved: "chip-ok", rejected: "chip-muted",
};

export default async function AdminVerification() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: docs }, { data: vendors }] = await Promise.all([
    supabase.from("vendor_documents").select("*").order("created_at", { ascending: false }),
    supabase.from("vendors").select("id, name, kyc_verified, terms_accepted_at"),
  ]);
  const documents = (docs ?? []) as VendorDocument[];
  const vmap = new Map(((vendors ?? []) as { id: string; name: string; kyc_verified: boolean; terms_accepted_at: string | null }[]).map((v) => [v.id, v]));

  // Signed URLs so an admin can open each private file.
  const links = new Map<string, string>();
  await Promise.all(documents.map(async (d) => {
    const { data } = await supabase.storage.from("vendor-docs").createSignedUrl(d.file_path, 60 * 10);
    if (data?.signedUrl) links.set(d.id, data.signedUrl);
  }));

  // Group documents by vendor.
  const byVendor = new Map<string, VendorDocument[]>();
  for (const d of documents) {
    const arr = byVendor.get(d.vendor_id) ?? [];
    arr.push(d); byVendor.set(d.vendor_id, arr);
  }
  const pendingCount = documents.filter((d) => d.status === "pending").length;

  return (
    <AdminShell active="/admin/verification" name={profile.full_name} role={profile.role}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Verification</h1>
        <span className="chip-warn text-xs">{pendingCount} pending</span>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        Review the ID and CAC documents vendors upload after onboarding, then mark the
        vendor KYC-verified. This is separate from operational status under Vendors.
      </p>

      <div className="mt-6 space-y-5">
        {[...byVendor.entries()].map(([vendorId, list]) => {
          const v = vmap.get(vendorId);
          return (
            <div key={vendorId} className="rounded-card border border-ink/10 bg-white">
              <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-ink">{v?.name ?? "Vendor"}</p>
                  <span className={v?.kyc_verified ? "chip-ok" : "chip-muted"}>
                    {v?.kyc_verified ? "KYC verified" : "Unverified"}
                  </span>
                  <span className={v?.terms_accepted_at ? "chip-ok" : "chip-warn"}>
                    {v?.terms_accepted_at ? "Terms accepted" : "Terms pending"}
                  </span>
                </div>
                <KycToggle vendorId={vendorId} verified={Boolean(v?.kyc_verified)} />
              </div>
              <ul className="divide-y divide-ink/5">
                {list.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{DOC_LABEL[d.type]}</p>
                      <p className="text-xs text-slate">
                        {links.get(d.id)
                          ? <a href={links.get(d.id)} target="_blank" rel="noreferrer" className="text-ink underline">{d.original_name ?? "View file"}</a>
                          : (d.original_name ?? d.file_path.split("/").pop())}
                        {" · "}uploaded {dateShort(d.created_at)}{d.note ? ` · ${d.note}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={STATUS_CHIP[d.status]}>{d.status}</span>
                      <DocReview id={d.id} status={d.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {documents.length === 0 && (
          <div className="rounded-card border border-ink/10 bg-white p-8 text-center text-slate">
            No documents uploaded yet.
          </div>
        )}
      </div>
    </AdminShell>
  );
}
