import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewExtra, ExtraCard } from "./ServicesClient";
import type { ServiceExtra } from "@/lib/database.types";

export default async function AdminServices() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: extras } = await supabase.from("service_extras").select("*").order("price");
  const list = (extras ?? []) as ServiceExtra[];

  return (
    <AdminShell active="/admin/services" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Services & extras</h1>
      <p className="mt-1 text-sm text-slate">
        Premium orders unlock these extras. The express and premium markups and the
        non-collection penalty are set under <span className="font-medium text-ink">Fees &amp; charges</span>.
      </p>

      <div className="mt-8 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-ink">Premium extras</h2>
          <p className="text-xs text-slate">High-end add-ons offered on premium orders.</p>
        </div>
        <NewExtra />
      </div>

      {list.length === 0 ? (
        <p className="mt-4 text-sm text-slate">No extras yet. Add the first one above.</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => <ExtraCard key={e.id} extra={e} />)}
        </div>
      )}
    </AdminShell>
  );
}
