import { getProfile } from "@/lib/auth";
import { EMAIL_TEMPLATES, EMAIL_EVENTS, type EmailContext } from "@/lib/emails";

export const dynamic = "force-dynamic";

const SAMPLE: EmailContext = {
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
};

const LABEL: Record<string, string> = {
  order_confirmed: "Order confirmed", pickup_assigned: "Pickup assigned",
  checked_in: "Checked in", stage_complete: "Stage complete",
  ready_for_delivery: "Ready for delivery", out_for_delivery: "Out for delivery (Pay now)",
  payment_due: "Payment due", payment_received: "Payment received",
  order_closed: "Order complete", item_type_requested: "Item type requested (vendor)",
  item_type_approved: "Item type approved (vendor)", payout_sent: "Payout sent (vendor)",
  email_verification: "Email verification", email_verification_reminder: "Verification reminder",
};

/** Admin-only preview of the email templates with sample data. */
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });
  if (profile.role !== "platform_admin" && profile.role !== "support_agent") {
    return new Response("Forbidden", { status: 403 });
  }

  const event = new URL(req.url).searchParams.get("event");

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

  const page = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>laundriroom email templates</title></head>
<body style="margin:0;background:#F8F5EF;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:40px 20px;">
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:21px;color:#0F1B2D;font-weight:700;letter-spacing:-.3px;margin:0;">laundriroom</p>
  <h1 style="font-family:Georgia,serif;color:#0F1B2D;">Email templates</h1>
  <p style="color:#5B6678;">Every communication, rendered with sample data. Click any one to open it.</p>
  <ul style="list-style:none;padding:0;margin:24px 0 0;">${items}</ul>
</div></body></html>`;

  return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
