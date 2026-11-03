import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Stars } from "@/components/ui/Stars";
import { ShareButton } from "@/components/ui/ShareButton";
import { getProfile } from "@/lib/auth";
import { money, dateShort, SERVICE_LABEL } from "@/lib/format";
import { hoursLabel, isVendorOpenNow } from "@/lib/hours";
import {
  getVendorProfile, siteUrl, vendorOrderPath, vendorProfileUrl, type VendorProfile,
} from "@/lib/vendorProfile";
import type { ServiceType } from "@/lib/database.types";

/**
 * A vendor's public profile — the link vendors share with their own customers
 * (/v/<slug>, generated automatically when the vendor is created). Anyone can
 * view it, signed in or not. The Order button takes customers straight to the
 * order form with this laundry chosen; signed-out visitors create an account
 * (or sign in) first and come straight back.
 */

export const dynamic = "force-dynamic";

const SERVICES: ServiceType[] = ["wash_and_fold", "dry_clean", "press_only"];

const DELIVERY_LINE: Record<VendorProfile["delivery"], string> = {
  own_riders: "Pickup & delivery by the laundry's own riders",
  dispatch_partner: "Pickup & delivery by a dispatch partner",
  both: "Pickup & delivery by own riders or a dispatch partner",
};

function place(v: VendorProfile) {
  return [v.area, v.city].filter(Boolean).join(", ");
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const v = await getVendorProfile(params.slug);
  if (!v) return { title: "Laundry not found — laundriroom" };
  const where = place(v);
  const rating = v.rating.count > 0 ? ` Rated ${v.rating.avg.toFixed(1)}/5 by ${v.rating.count} customers.` : "";
  const description = `Order laundry from ${v.name}${where ? ` in ${where}` : ""} on laundriroom — drop-off or pickup, track every item, pay in the app.${rating}`;
  const title = `${v.name}${where ? ` · ${where}` : ""} — laundriroom`;
  return {
    title,
    description,
    metadataBase: new URL(siteUrl()),
    alternates: { canonical: `/v/${v.slug}` },
    openGraph: {
      title, description, url: `/v/${v.slug}`, siteName: "laundriroom", type: "website",
      images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "laundriroom" }],
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function VendorProfilePage({ params }: { params: { slug: string } }) {
  const v = await getVendorProfile(params.slug);
  if (!v) notFound();

  const viewer = await getProfile();
  const isCustomer = viewer?.role === "customer";
  const isStaff = !!viewer && !isCustomer;
  const taking = v.status === "verified";
  const openNow = isVendorOpenNow(v);
  const hours = hoursLabel(v.opens_at, v.closes_at);
  const orderPath = vendorOrderPath(v.slug);
  const next = encodeURIComponent(orderPath);
  const url = vendorProfileUrl(v.slug);

  // Price list: one row per item, a column per service.
  const items = new Map<string, Partial<Record<ServiceType, number>>>();
  for (const p of v.prices) {
    const row = items.get(p.item) ?? {};
    row[p.service] = Number(p.price);
    items.set(p.item, row);
  }
  const priceRows = Array.from(items.entries());
  const services = SERVICES.filter((s) => priceRows.some(([, r]) => r[s] != null));
  const FIRST = 10;

  const orderCta = (big = false) => {
    const cls = `btn-accent ${big ? "w-full sm:w-auto sm:px-8" : "w-full sm:w-auto"}`;
    if (!taking) {
      return (
        <p className="rounded-card border border-ivory/15 bg-ivory/5 px-4 py-3 text-sm text-ivory/80">
          {v.name} is getting set up on laundriroom. Online ordering opens once the laundry is approved — check back soon.
        </p>
      );
    }
    if (isStaff) {
      return (
        <p className="rounded-card border border-ivory/15 bg-ivory/5 px-4 py-3 text-sm text-ivory/80">
          You&apos;re signed in with a staff account. Customers see an <strong>Order from {v.name}</strong> button here.
        </p>
      );
    }
    if (isCustomer) {
      return <Link href={orderPath} className={cls}>Order from {v.name}</Link>;
    }
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href={`/signup?next=${next}`} className={cls}>Order from {v.name}</Link>
        <Link href={`/login?next=${next}`} className="text-center text-sm text-ivory/70 underline sm:text-left">
          I already have an account
        </Link>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-ivory pb-16">
      {/* Hero */}
      <section className="bg-ink text-ivory">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="laundriroom home"><Logo variant="light" className="text-base" /></Link>
            <ShareButton url={url} title={v.name}
              text={`Order your laundry from ${v.name} on laundriroom`}
              className="inline-flex items-center gap-2 rounded-pill border border-ivory/20 px-4 py-2 text-sm text-ivory hover:bg-ivory/10" />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-2">
            {v.kyc_verified && (
              <span className="chip bg-teal/20 text-teal">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2l2.4 2.2 3.2-.3.9 3.1 2.8 1.6-1 3.1 1 3.1-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.2-3.2.3-.9-3.1-2.8-1.6 1-3.1-1-3.1 2.8-1.6.9-3.1 3.2.3z" />
                  <path d="M8.5 12.2l2.3 2.3 4.7-4.8" />
                </svg>
                Verified business
              </span>
            )}
            {taking && (
              <span className={`chip ${openNow ? "bg-teal/20 text-teal" : "bg-ivory/10 text-ivory/70"}`}>
                {openNow ? "Open now" : "Closed now"} · {hours}
              </span>
            )}
            {!taking && <span className="chip bg-champagne/20 text-champagne">Coming soon</span>}
          </div>

          <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{v.name}</h1>

          {(v.address_line || place(v)) && (
            <p className="mt-2 flex items-start gap-2 text-sm text-ivory/70">
              <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-7-6.1-7-11.5A7 7 0 0119 9.5C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
              </svg>
              <span>{[v.address_line, place(v)].filter(Boolean).join(" · ")}</span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ivory/70">
            {v.rating.count > 0 ? (
              <a href="#reviews" className="inline-flex items-center gap-2 hover:text-ivory">
                <Stars value={v.rating.avg} size={15} />
                <span><strong className="text-ivory">{v.rating.avg.toFixed(1)}</strong> · {v.rating.count} review{v.rating.count === 1 ? "" : "s"}</span>
              </a>
            ) : (
              <span>No reviews yet</span>
            )}
            {v.completed_orders >= 10 && <span>{v.completed_orders.toLocaleString("en-NG")} orders completed</span>}
          </div>

          <div className="mt-7">{orderCta(true)}</div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
        {/* At a glance */}
        <section className="card p-5">
          <h2 className="font-display text-lg text-ink">How it works here</h2>
          <ul className="mt-3 divide-y divide-ink/5 text-sm">
            {[
              ["Hours", `${hours} daily (Lagos time). Drop-off and pickup follow these hours.`],
              ["Getting it in", "Drop off at the shop, or book a pickup."],
              ["Getting it back", `Collect from the shop, or have it delivered. ${DELIVERY_LINE[v.delivery]}.`],
              ["Service", "Standard or Premium (with extras like stain treatment), normal or Express turnaround."],
              ["Paying", "Pay online in the app, or on delivery. Every item is tagged and priced at check-in."],
              ["On laundriroom since", dateShort(v.member_since)],
            ].map(([k, val]) => (
              <li key={k} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
                <span className="shrink-0 text-slate sm:w-40">{k}</span>
                <span className="text-ink">{val}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Prices */}
        {priceRows.length > 0 && (
          <section className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-ink">Prices</h2>
              <p className="text-xs text-slate">Per item · standard turnaround</p>
            </div>
            <PriceTable rows={priceRows.slice(0, FIRST)} services={services} />
            {priceRows.length > FIRST && (
              <details className="group">
                <summary className="mt-2 cursor-pointer list-none text-sm font-medium text-ink underline group-open:hidden">
                  Show all {priceRows.length} items
                </summary>
                <PriceTable rows={priceRows.slice(FIRST)} services={services} hideHead />
              </details>
            )}
            <p className="mt-3 text-xs text-slate">
              Prices are confirmed when your items are checked in. Express and Premium cost a little more; delivery is added if you choose it.
            </p>
          </section>
        )}

        {/* Reviews */}
        <section id="reviews" className="card scroll-mt-4 p-5">
          <h2 className="font-display text-lg text-ink">Ratings &amp; reviews</h2>
          {v.rating.count === 0 ? (
            <p className="mt-2 text-sm text-slate">No reviews yet. Customers can rate their order once it&apos;s complete.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="text-center sm:w-36">
                  <p className="font-display text-5xl text-ink">{v.rating.avg.toFixed(1)}</p>
                  <div className="mt-1"><Stars value={v.rating.avg} size={16} /></div>
                  <p className="mt-1 text-xs text-slate">{v.rating.count} review{v.rating.count === 1 ? "" : "s"}</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {(["5", "4", "3", "2", "1"] as const).map((s) => {
                    const n = v.rating.dist[s] ?? 0;
                    const pct = v.rating.count ? Math.round((n / v.rating.count) * 100) : 0;
                    return (
                      <div key={s} className="flex items-center gap-3 text-xs text-slate">
                        <span className="w-6">{s}★</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-pill bg-ink/5">
                          <div className="h-full rounded-pill bg-champagne" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-6 text-right">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <ul className="mt-5 space-y-3">
                {v.reviews.map((r, i) => (
                  <li key={i} className="rounded-card border border-ink/5 bg-ivory/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Stars value={r.rating} size={13} />
                        <span className="text-sm font-medium text-ink">{r.reviewer || "Customer"}</span>
                      </div>
                      <span className="text-xs text-slate">{dateShort(r.created_at)}</span>
                    </div>
                    {r.comment && <p className="mt-2 text-sm text-ink/80">&ldquo;{r.comment}&rdquo;</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate">Reviews come from customers with a completed laundriroom order.</p>
            </>
          )}
        </section>

        {/* Bottom call to action */}
        <section className="rounded-card bg-ink p-6 text-ivory">
          <h2 className="font-display text-xl">Ready when you are</h2>
          <p className="mt-1 text-sm text-ivory/70">
            Book in a minute, follow every item from check-in to your door, and pay in the app.
          </p>
          <div className="mt-5">{orderCta()}</div>
        </section>

        <footer className="flex flex-col items-center gap-2 pt-4 text-center text-xs text-slate">
          <Link href="/" aria-label="laundriroom home"><Logo className="text-sm" /></Link>
          <p>Orders are placed, tracked and paid securely through laundriroom.</p>
        </footer>
      </div>
    </main>
  );
}

function PriceTable({ rows, services, hideHead = false }: {
  rows: [string, Partial<Record<ServiceType, number>>][]; services: ServiceType[]; hideHead?: boolean;
}) {
  return (
    <table className="mt-3 w-full table-fixed text-sm">
      {/* Fixed column widths so the "show all" table lines up with the first. */}
      <colgroup>
        <col />
        {services.map((s) => <col key={s} className="w-[4.6rem] sm:w-28" />)}
      </colgroup>
      {!hideHead && (
        <thead>
          <tr className="text-left text-xs text-slate">
            <th className="py-2 pr-2 font-medium">Item</th>
            {services.map((s) => <th key={s} className="py-2 pl-2 text-right font-medium">{SERVICE_LABEL[s]}</th>)}
          </tr>
        </thead>
      )}
      <tbody className="divide-y divide-ink/5">
        {rows.map(([item, r]) => (
          <tr key={item}>
            <td className="py-2.5 pr-2 text-ink">{item}</td>
            {services.map((s) => (
              <td key={s} className="whitespace-nowrap py-2.5 pl-2 text-right text-ink">
                {r[s] != null ? money(r[s]) : <span className="text-slate">—</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
