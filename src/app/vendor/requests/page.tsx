import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { NewRequestForm, RequestRow } from "./RequestsClient";
import type { ItemTypeRequest } from "@/lib/database.types";

export default async function RequestsPage() {
  const ctx = await getVendorContext();
  const supabase = createClient();

  const { data } = await supabase
    .from("item_type_requests").select("*")
    .eq("vendor_id", ctx.vendorId)
    .order("created_at", { ascending: false });

  const reqs = (data ?? []) as ItemTypeRequest[];
  const pending = reqs.filter((r) => r.status === "pending");
  const decided = reqs.filter((r) => r.status !== "pending");

  return (
    <VendorShell active="/vendor/requests" vendorName={ctx.vendorName}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <h1 className="font-display text-2xl text-ink">Item type requests</h1>
      <p className="mt-1 text-sm text-slate">
        Attendants propose new item types; a manager approves before they join the catalogue.
      </p>

      <div className="mt-6 max-w-xl"><NewRequestForm vendorId={ctx.vendorId} /></div>

      <section className="mt-8">
        <h2 className="font-display text-lg text-ink">Pending</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nothing waiting for approval.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pending.map((r) => <RequestRow key={r.id} req={r} canDecide={ctx.isManager} />)}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg text-ink">Decided</h2>
          <div className="mt-3 space-y-2">
            {decided.map((r) => <RequestRow key={r.id} req={r} canDecide={false} />)}
          </div>
        </section>
      )}
    </VendorShell>
  );
}
