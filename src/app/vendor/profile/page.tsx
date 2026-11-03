import Link from "next/link";
import { VendorShell } from "@/components/shells/VendorShell";
import { getVendorContext } from "@/lib/vendor";
import { createClient } from "@/lib/supabase/server";
import { vendorProfileUrl } from "@/lib/vendorProfile";
import { ShareKit } from "./ShareKit";

/**
 * Vendor → My page: the vendor's public profile link (created automatically
 * when the vendor was set up), ready to copy, send on WhatsApp or print as a
 * QR code — plus what the link has brought in so far.
 */
export default async function VendorProfileLink() {
  const ctx = await getVendorContext();
  const supabase = createClient();

  const [{ data: vendor }, { data: linkOrders }] = await Promise.all([
    supabase.from("vendors").select("slug, status, kyc_verified").eq("id", ctx.vendorId).maybeSingle(),
    supabase.from("orders").select("customer_id, status").eq("vendor_id", ctx.vendorId).eq("via_vendor_link", true),
  ]);

  const v = vendor as { slug: string; status: string; kyc_verified: boolean } | null;
  const orders = (linkOrders ?? []) as { customer_id: string; status: string }[];
  const customers = new Set(orders.map((o) => o.customer_id)).size;
  const completed = orders.filter((o) => o.status === "closed").length;

  return (
    <VendorShell active="/vendor/profile" vendorName={ctx.vendorName}
      staffName={ctx.profile.full_name} staffRole={ctx.roleLabel} branchName={ctx.branchName}>
      <h1 className="font-display text-2xl text-ink">My page</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        Your own laundriroom page — your name, location, verified badge, prices, ratings and reviews — with an
        Order button that sends customers straight to you. Share the link with your customers.
      </p>

      {!v ? (
        <p className="mt-6 text-sm text-slate">Your page isn&apos;t ready yet. Please contact support.</p>
      ) : (
        <>
          {v.status !== "verified" && (
            <p className="mt-5 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">
              Your page is live, but customers can only place orders once laundriroom approves your laundry.
            </p>
          )}

          <div className="mt-6">
            <ShareKit url={vendorProfileUrl(v.slug)} vendorName={ctx.vendorName} />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Orders from your link", orders.length, "placed by customers who opened your page"],
              ["Customers", customers, "who ordered through your link"],
              ["Completed", completed, "of those orders"],
            ].map(([label, n, sub]) => (
              <div key={String(label)} className="card p-5">
                <p className="text-xs text-slate">{label}</p>
                <p className="mt-1 font-display text-3xl text-ink">{n}</p>
                <p className="text-xs text-slate">{sub}</p>
              </div>
            ))}
          </div>

          <div className="card mt-6 p-5 text-sm">
            <p className="font-medium text-ink">Make your page stronger</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate">
              {!v.kyc_verified && (
                <li>
                  Get the <strong className="text-ink">Verified business</strong> badge: upload your ID and CAC certificate at{" "}
                  <Link href="/vendor/verification" className="text-ink underline">Verification</Link>.
                </li>
              )}
              <li>Keep your prices up to date — they show on your page.</li>
              <li>Ask happy customers to rate their order in the app; ratings and reviews appear on your page.</li>
            </ul>
            <p className="mt-3 text-xs text-slate">
              Your link name was created from your laundry&apos;s name and stays the same if you rename, so links
              you&apos;ve shared keep working. To change it, contact laundriroom support.
            </p>
          </div>
        </>
      )}
    </VendorShell>
  );
}
