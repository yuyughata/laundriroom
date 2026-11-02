import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ApplicationActions } from "./ApplicationActions";
import { dateShort } from "@/lib/format";
import type { VendorApplication } from "@/lib/database.types";

const STATUS_CHIP: Record<string, string> = {
  pending: "chip-warn", approved: "chip-ok", rejected: "chip-muted",
};

export default async function AdminApplications() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data } = await supabase
    .from("vendor_applications").select("*").order("created_at", { ascending: false });
  const apps = (data ?? []) as VendorApplication[];
  const pendingCount = apps.filter((a) => a.status === "pending").length;

  return (
    <AdminShell active="/admin/applications" name={profile.full_name} role={profile.role}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Vendor applications</h1>
        <span className="chip-warn text-xs">{pendingCount} pending</span>
      </div>
      <p className="mt-1 text-sm text-slate">
        Laundries that applied to join via the public form. Approving one creates
        a pending vendor you can then verify and set up under Vendors.
      </p>

      <div className="mt-6 space-y-3">
        {apps.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-ink">{a.business_name}</p>
                  <span className={STATUS_CHIP[a.status]}>{a.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate">
                  {a.contact_name} · {a.email} · {a.phone}
                </p>
                <p className="text-xs text-slate">
                  {[a.area, a.city].filter(Boolean).join(", ") || "No area given"}
                  {" · "}{a.delivery.replace("_", " ")}{" · "}applied {dateShort(a.created_at)}
                </p>
                {a.message && <p className="mt-2 text-sm text-ink">“{a.message}”</p>}
              </div>
              {a.status === "pending" && <ApplicationActions id={a.id} />}
            </div>
          </div>
        ))}
        {apps.length === 0 && (
          <div className="card p-8 text-center text-slate">No applications yet.</div>
        )}
      </div>
    </AdminShell>
  );
}
