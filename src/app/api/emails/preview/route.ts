import { getProfile } from "@/lib/auth";
import { EMAIL_TEMPLATES, EMAIL_EVENTS, AUTH_EMAIL_TEMPLATES, sampleAuthEmail, type EmailContext } from "@/lib/emails";

export const dynamic = "force-dynamic";

const SAMPLE: EmailContext = {
  rating: 2,
  review_comment: "My white shirt came back with a stain and two buttons missing.",
  action_message: "We've seen several low ratings mentioning damaged items. What happened, and what are you changing?",
  bad_reviews_30: 3,
  quality_url: "#",
  reviews_url: "#",
  order_code: "ORD-261101-0042",
  customer_name: "Barry",
  vendor_name: "Fold & Press, Lekki",
  item_count: 5,
  total: "₦14,200",
  track_url: "#",
  pay_url: "#",
  verify_url: "#",
  requests_url: "#",
  ledger_url: "#",
  return_line: "We'll deliver it to your address shortly.",
  pay_line: "Tap Pay now when the rider arrives — paying closes the order.",
  stage: "Pressing",
  requested_by: "Chidi E.",
  item_name: "Kaftan",
  price: "₦1,500",
  net: "₦4,080",
  email: "barry@example.com",
  changed_at: "2 Nov 2026, 14:05",
  changes: "Name, Phone",
  signin_url: "#",
  account_url: "#",
  support_url: "#",
  admin_name: "Tola",
  ticket_number: 1042,
  subject: "When will my agbada be ready?",
  category: "Order & delivery · Late delivery",
  customer_email: "ada.obi@gmail.com",
  customer_phone: "+234 810 333 0005",
  message_excerpt: "Hi, I dropped off 6 items yesterday including an agbada for an event on Saturday. Will it be ready by Friday evening?",
  ticket_status: "In progress",
  ticket_url: "#",
  customer_ticket_url: "#",
  recipient_name: "Chidi",
  entry_line: "Pickup from customer",
  address_line: "Flat 4, 21 Fola Osibo Rd, Lekki Phase 1, Lagos",
  return_mode_line: "Deliver back to customer",
  service_line: "Premium · Express",
  extras_line: "Stain treatment, Fabric softener & scent",
  payment_line: "Pay online",
  notes: "Gate code 4412. Please handle the agbada with care.",
  order_url: "#",
  placed_by_line: "Fold & Press, Lekki staff · Halima Bello",
};

const LABEL: Record<string, string> = {
  order_confirmed: "Order confirmed", pickup_assigned: "Pickup assigned",
  checked_in: "Checked in", stage_complete: "Stage complete",
  ready_for_delivery: "Ready for delivery", out_for_delivery: "Out for delivery (Pay now)",
  payment_due: "Payment due", payment_received: "Payment received",
  order_closed: "Order complete", item_type_requested: "Item type requested (vendor)",
  item_type_approved: "Item type approved (vendor)", payout_sent: "Payout sent (vendor)",
  email_verification: "Email verification", email_verification_reminder: "Verification reminder",
  password_changed: "Password changed", account_updated: "Account details updated",
  account_suspended: "Account suspended", account_reactivated: "Account reactivated",
  ticket_opened: "New support ticket (admins)", ticket_message: "Customer replied on ticket (admins)",
  ticket_reply: "Support replied (customer)",
  order_placed: "New order (admins & vendor)",
};

/** Admin-only preview of the email templates with sample data. */
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });
  if (profile.role !== "platform_admin" && profile.role !== "support_agent") {
    return new Response("Forbidden", { status: 403 });
  }

  const event = new URL(req.url).searchParams.get("event");

  const auth = new URL(req.url).searchParams.get("auth");
  if (auth && AUTH_EMAIL_TEMPLATES[auth]) {
    return new Response(sampleAuthEmail(AUTH_EMAIL_TEMPLATES[auth].html), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (event && EMAIL_TEMPLATES[event]) {
    const { html } = EMAIL_TEMPLATES[event](SAMPLE);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  // Index of all templates
  const items = EMAIL_EVENTS.map((e) => {
    const { subject } = EMAIL_TEMPLATES[e](SAMPLE);
    return `<li style="margin:0 0 10px;">
      <a href="/api/emails/preview?event=${e}" target="_blank"
         style="color:#0F1B2D;text-decoration:none;font-weight:600;">${LABEL[e] ?? e}</a>
      <span style="color:#5B6678;"> — ${subject.replace(/</g, "&lt;")}</span>
    </li>`;
  }).join("");

  const authItems = Object.entries(AUTH_EMAIL_TEMPLATES).map(([k, t]) => `<li style="margin:0 0 10px;">
      <a href="/api/emails/preview?auth=${k}" target="_blank"
         style="color:#0F1B2D;text-decoration:none;font-weight:600;">${t.label}</a>
      <span style="color:#5B6678;"> — ${t.subject.replace(/</g, "&lt;")}</span>
    </li>`).join("");

  const page = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>laundriroom email templates</title></head>
<body style="margin:0;background:#F8F5EF;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:40px 20px;">
  <p style="margin:0;display:flex;align-items:center;gap:9px;font-family:Arial,Helvetica,sans-serif;font-size:21px;color:#0F1B2D;font-weight:700;letter-spacing:-.3px;">
    <img src="/brand/mark-email.png" width="32" height="24" alt="" style="display:block;">laundriroom
  </p>
  <h1 style="font-family:Georgia,serif;color:#0F1B2D;">Email templates</h1>
  <p style="color:#5B6678;">Every communication, rendered with sample data. Click any one to open it.</p>
  <ul style="list-style:none;padding:0;margin:24px 0 0;">${items}</ul>
  <h2 style="font-family:Georgia,serif;color:#0F1B2D;margin-top:36px;">Sign-in &amp; security (sent by Supabase Auth)</h2>
  <p style="color:#5B6678;">These carry Supabase's one-time links, so Supabase sends them. Paste each file from <code>supabase/templates/</code> into Authentication → Email Templates.</p>
  <ul style="list-style:none;padding:0;margin:24px 0 0;">${authItems}</ul>
</div></body></html>`;

  return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
