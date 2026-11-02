/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ResolveForm } from "./ResolveForm";
import { dateTime, SERVICE_LABEL } from "@/lib/format";
import type { Claim, OrderItem, Order, Profile, Vendor } from "@/lib/database.types";

export default async function ClaimDetail({ params }: { params: { id: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: claim } = await supabase.from("claims").select("*").eq("id", params.id).maybeSingle();
  if (!claim) notFound();
  const c = claim as Claim;

  const [{ data: order }, { data: item }, { data: customer }, { data: vendor }] = await Promise.all([
    supabase.from("orders").select("code").eq("id", c.order_id).maybeSingle(),
    c.order_item_id ? supabase.from("order_items").select("*").eq("id", c.order_item_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name, email, phone").eq("id", c.customer_id).maybeSingle(),
    supabase.from("vendors").select("name").eq("id", c.vendor_id).maybeSingle(),
  ]);
  const oi = item as OrderItem | null;
  const cust = customer as Pick<Profile, "full_name" | "email" | "phone"> | null;

  // Signed URLs for the item's check-in photos (private bucket).
  let photoUrls: string[] = [];
  if (oi?.photos?.length) {
    const signed = await Promise.all(
      oi.photos.map((p) => supabase.storage.from("item-photos").createSignedUrl(p, 3600))
    );
    photoUrls = signed.map((s) => s.data?.signedUrl).filter(Boolean) as string[];
  }

  return (
    <AdminShell active="/admin/claims" name={profile.full_name} role={profile.role}>
      <Link href="/admin/claims" className="text-sm text-slate">← Claims</Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <h1 className="font-display text-xl text-ink">
            #{c.number} · {c.type === "loss" ? "Lost item" : "Damage"} · {(order as Pick<Order, "code"> | null)?.code}
          </h1>
          <p className="mt-1 text-xs text-slate">
            {(vendor as Pick<Vendor, "name"> | null)?.name} · opened {dateTime(c.created_at)}
          </p>
          <p className="mt-3 text-sm text-ink">{c.description}</p>

          <h2 className="mt-6 font-display text-lg text-ink">Item-level evidence</h2>
          {oi ? (
            <div className="mt-2 card p-4">
              <p className="text-sm font-medium text-ink">{oi.sub_code} · {SERVICE_LABEL[oi.service]}</p>
              {oi.condition_notes && <p className="mt-1 text-sm text-warn">Check-in condition: {oi.condition_notes}</p>}
              {oi.customer_comment && <p className="mt-1 text-xs text-slate">Customer note: “{oi.customer_comment}”</p>}
              {photoUrls.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {photoUrls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                      <img src={u} alt={`evidence ${i + 1}`} className="h-28 w-full rounded-card object-cover" />
                    </a>
                  ))}
                </div>
              ) : <p className="mt-2 text-xs text-slate">No check-in photos for this item.</p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate">This claim is about the whole order (no specific item).</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <p className="label">Customer</p>
            <p className="text-sm font-medium text-ink">{cust?.full_name ?? "—"}</p>
            <p className="text-xs text-slate">{cust?.email ?? ""}</p>
            <p className="text-xs text-slate">{cust?.phone ?? ""}</p>
          </div>
          <ResolveForm id={c.id} status={c.status} compensation={c.compensation} note={c.resolution_note} />
        </div>
      </div>
    </AdminShell>
  );
}
