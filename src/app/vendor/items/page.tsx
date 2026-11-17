import Link from "next/link";
import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { NewRequestForm, RequestRow } from "../requests/RequestsClient";
import { ItemsManager, type ManagedItem } from "./ItemsManager";
import type { ItemTypeRequest, ServiceType } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type Tab = "requests" | "manage";

export default async function ItemsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const ctx = await getVendorContext();
  const tab: Tab = searchParams.tab === "manage" ? "manage" : "requests";
  const supabase = createClient();

  const [{ data: reqData }, { data: priceData }] = await Promise.all([
    supabase.from("item_type_requests").select("*").eq("vendor_id", ctx.vendorId).order("created_at", { ascending: false }),
    supabase.from("price_list")
      .select("id, item_type_id, service, price, active, item_types(name, vendor_id)")
      .eq("vendor_id", ctx.vendorId).eq("active", true),
  ]);

  const reqs = (reqData ?? []) as ItemTypeRequest[];
  const pending = reqs.filter((r) => r.status === "pending");
  const decided = reqs.filter((r) => r.status !== "pending");

  const items: ManagedItem[] = ((priceData ?? []) as unknown[])
    .map((r) => {
      const row = r as { id: string; item_type_id: string; service: ServiceType; price: number;
        item_types: { name: string; vendor_id: string | null } | { name: string; vendor_id: string | null }[] | null };
      const it = Array.isArray(row.item_types) ? row.item_types[0] : row.item_types;
      return {
        priceId: row.id,
        itemTypeId: row.item_type_id,
        name: it?.name ?? "Item",
        service: row.service,
        price: Number(row.price),
        vendorOwned: it?.vendor_id === ctx.vendorId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.service.localeCompare(b.service));

  const tabCls = (t: Tab) =>
    `rounded-pill px-3 py-1.5 text-xs ${t === tab ? "bg-ink text-ivory" : "bg-white text-ink border border-ink/15 hover:bg-ink/5"}`;

  return (
    <VendorShell active="/vendor/items" vendorName={ctx.vendorName} isManager={ctx.isManager}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <h1 className="font-display text-2xl text-ink">Items</h1>
      <p className="mt-1 text-sm text-slate">
        Propose new items for approval, and manage the prices of the ones you offer.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/vendor/items?tab=requests" className={tabCls("requests")}>Requests</Link>
        <Link href="/vendor/items?tab=manage" className={tabCls("manage")}>Items manager</Link>
      </div>

      {tab === "requests" ? (
        <div className="mt-6">
          <div className="max-w-xl"><NewRequestForm vendorId={ctx.vendorId} /></div>
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
        </div>
      ) : (
        <div className="mt-6 max-w-2xl">
          <h2 className="font-display text-lg text-ink">Your items &amp; prices</h2>
          {ctx.isManager ? (
            <>
              <p className="mt-1 text-sm text-slate">Edit a price (or an item&rsquo;s name), or remove an item from your list. Changes apply across all your branches.</p>
              <ItemsManager items={items} vendorId={ctx.vendorId} />
            </>
          ) : (
            <p className="mt-3 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">
              Only a business-wide manager can edit items and prices. You can still propose new items under Requests.
            </p>
          )}
        </div>
      )}
    </VendorShell>
  );
}
