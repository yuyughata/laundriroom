import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * NDPR data-subject access / portability: a signed-in user downloads a copy of
 * the personal data we hold about them, as JSON. Everything is read through the
 * cookie-authenticated client, so Row Level Security returns only the caller's
 * own rows.
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient();
  const uid = profile.id;

  // Each query is RLS-scoped to the signed-in user; fall back to [] on any error.
  const safe = async <T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> => {
    try {
      const { data } = await p;
      return data ?? null;
    } catch {
      return null;
    }
  };

  const [addresses, orders, reviews, tickets] = await Promise.all([
    safe(supabase.from("customer_addresses").select("label, line1, area, city, lat, lng, is_default, created_at").eq("customer_id", uid)),
    safe(supabase.from("order_summaries").select("code, status, total, delivery_fee, item_count, is_paid, payment_timing, service_tier, turnaround, vendor_name, branch_name, created_at, ready_at, closed_at").eq("customer_id", uid).order("created_at", { ascending: false })),
    safe(supabase.from("reviews").select("rating, comment, order_id, created_at").eq("customer_id", uid).order("created_at", { ascending: false })),
    safe(supabase.from("support_tickets").select("number, category, subcategory, other_text, subject, status, created_at").eq("customer_id", uid).order("created_at", { ascending: false })),
  ]);

  // Support message bodies for the user's own tickets (RLS-scoped).
  const messages = await safe(
    supabase.from("support_messages").select("ticket_id, body, created_at").order("created_at"),
  );

  const payload = {
    export: {
      generated_at: new Date().toISOString(),
      about: "A copy of the personal data laundriroom holds about you, provided under the Nigeria Data Protection Regulation (NDPR).",
      contact: "dpo@laundriroom.app",
    },
    account: {
      name: profile.full_name,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      role: profile.role,
      email_verified: profile.email_verified,
      referral_code: profile.referral_code ?? null,
      marketing_emails_opted_out: !!profile.newsletter_opt_out,
      terms_accepted_at: profile.terms_accepted_at ?? null,
      created_at: profile.created_at,
    },
    addresses: addresses ?? [],
    orders: orders ?? [],
    reviews: reviews ?? [],
    support_tickets: tickets ?? [],
    support_messages: messages ?? [],
  };

  const body = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="laundriroom-my-data-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
