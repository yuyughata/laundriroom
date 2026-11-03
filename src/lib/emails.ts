/**
 * laundriroom transactional email templates — "Ink & Ivory".
 *
 * One responsive, table-based HTML layout (email clients need tables + inline
 * styles) with a template per notification event. Pure string-building, no
 * imports, so the same file is mirrored into the Supabase edge function
 * (supabase/functions/_shared/emails.ts) and used by the in-app preview.
 *
 * Every template returns { subject, html, text }. Placeholders come from a
 * context object the sender fills (order_code, customer_name, total, urls, …).
 */

export type EmailContext = Record<string, string | number | undefined | null>;

const INK = "#0F1B2D";
const INK_SOFT = "#1C2A3E";
const IVORY = "#F8F5EF";
const CHAMP = "#C6A664";
const TEAL = "#5FB3A8";
const SLATE = "#5B6678";
const WARN = "#C9793B";

type Block = {
  preheader: string;
  heading: string;
  paragraphs: string[];
  rows?: { label: string; value: string }[];
  button?: { label: string; url: string; tone?: "ink" | "champagne" | "teal" };
  note?: string;
  accent?: string; // header accent bar colour
};

// Brand icon for the email header. Emails can't embed images reliably (Gmail
// blocks data: URIs), so it's loaded from the app's public URL. Server code
// sets the base once (send-notification uses SITE_URL); in the in-app preview
// the base is empty and the relative path resolves against the app.
let ASSET_BASE = "";
export function setEmailAssetBase(base: string) {
  ASSET_BASE = (base ?? "").replace(/\/$/, "");
}
const brandIconUrl = () => `${ASSET_BASE}/brand/mark-email.png`;

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The shared layout. Renders a full HTML email document. */
export function renderEmail(b: Block, iconUrl: string = brandIconUrl()): string {
  const accent = b.accent ?? CHAMP;
  const rows = b.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-collapse:collapse;">
        ${b.rows.map((r) => `
        <tr>
          <td style="padding:10px 12px 10px 0;border-bottom:1px solid #ECE7DD;font-family:Arial,Helvetica,sans-serif;color:${SLATE};font-size:14px;">${esc(r.label)}</td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #ECE7DD;font-family:Arial,Helvetica,sans-serif;color:${INK};font-size:14px;font-weight:600;">${esc(r.value)}</td>
        </tr>`).join("")}
       </table>`
    : "";

  const button = b.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr><td style="border-radius:999px;background:${
          b.button.tone === "champagne" ? CHAMP : b.button.tone === "teal" ? TEAL : INK
        };">
          <a href="${esc(b.button.url)}" target="_blank"
             style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:${
               b.button.tone === "ink" || !b.button.tone ? IVORY : INK
             };text-decoration:none;border-radius:999px;">${esc(b.button.label)}</a>
        </td></tr>
       </table>`
    : "";

  const paras = b.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2B3A52;">${p}</p>`)
    .join("");

  const note = b.note
    ? `<p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${SLATE};">${b.note}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(b.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${IVORY};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(b.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:28px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <!-- header: brand icon + wordmark -->
      <tr><td style="padding:4px 4px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:9px;vertical-align:middle;">
            <img src="${esc(iconUrl)}" width="32" height="24" alt="" style="display:block;width:32px;height:24px;border:0;outline:none;text-decoration:none;">
          </td>
          <td style="vertical-align:middle;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:700;color:${INK};letter-spacing:-.3px;">laundriroom</span>
          </td>
        </tr></table>
      </td></tr>
      <!-- card -->
      <tr><td style="background:#FFFFFF;border:1px solid #EFEAE0;border-radius:16px;overflow:hidden;">
        <div style="height:4px;background:${accent};"></div>
        <div style="padding:32px 32px 28px;">
          <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${INK};font-weight:700;">${esc(b.heading)}</h1>
          ${paras}
          ${rows}
          ${button}
          ${note}
        </div>
      </td></tr>
      <!-- footer -->
      <tr><td style="padding:22px 8px;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${SLATE};">laundriroom — laundry, handled.</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${SLATE};">You're receiving this because you have a laundriroom account.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Plain-text fallback from a block (for clients that prefer text). */
function toText(b: Block): string {
  const lines = [b.heading, "", ...b.paragraphs.map(stripTags)];
  if (b.rows?.length) { lines.push(""); b.rows.forEach((r) => lines.push(`${r.label}: ${r.value}`)); }
  if (b.button) { lines.push("", `${b.button.label}: ${b.button.url}`); }
  if (b.note) { lines.push("", stripTags(b.note)); }
  lines.push("", "— laundriroom");
  return lines.join("\n");
}
function stripTags(s: string): string { return s.replace(/<[^>]+>/g, ""); }

const c = (ctx: EmailContext, k: string, fallback = "") => esc(String(ctx[k] ?? fallback));

/** event → builder. Every notification event has a designed template. */
export const EMAIL_TEMPLATES: Record<string, (ctx: EmailContext) => { subject: string; html: string; text: string }> = {
  order_confirmed: (ctx) => build(`Your order ${c(ctx, "order_code")} is confirmed`, {
    preheader: `Order ${c(ctx, "order_code")} received`,
    heading: "Order confirmed",
    paragraphs: [
      `Hi ${c(ctx, "customer_name", "there")}, thanks for choosing laundriroom. We've received your order <strong>${c(ctx, "order_code")}</strong> with ${c(ctx, "vendor_name", "your laundry")}.`,
      `You can follow every item from pickup to delivery in the app.`,
    ],
    button: { label: "Track your order", url: String(ctx.track_url ?? "#"), tone: "ink" },
  }),

  pickup_assigned: (ctx) => build(`A rider is on the way — ${c(ctx, "order_code")}`, {
    preheader: "Your pickup rider is assigned",
    heading: "A rider is on the way",
    accent: TEAL,
    paragraphs: [`A rider has been assigned to collect ${c(ctx, "order_code")}. Please have your items ready.`],
    button: { label: "View pickup", url: String(ctx.track_url ?? "#"), tone: "ink" },
  }),

  checked_in: (ctx) => build(`We've got your laundry — ${c(ctx, "order_code")}`, {
    preheader: "Your items are checked in and tagged",
    heading: "We've got your laundry",
    paragraphs: [`Your items for <strong>${c(ctx, "order_code")}</strong> are checked in, tagged and priced.`],
    rows: [
      { label: "Items", value: String(ctx.item_count ?? "—") },
      { label: "Order total", value: String(ctx.total ?? "—") },
    ],
    button: { label: "See the breakdown", url: String(ctx.track_url ?? "#"), tone: "ink" },
  }),

  stage_complete: (ctx) => build(`Update on ${c(ctx, "order_code")}`, {
    preheader: "Your order has moved to the next stage",
    heading: "Your order is progressing",
    paragraphs: [`${c(ctx, "order_code")} has moved to the next stage: <strong>${c(ctx, "stage", "in progress")}</strong>.`],
    button: { label: "Track your order", url: String(ctx.track_url ?? "#"), tone: "ink" },
  }),

  ready_for_delivery: (ctx) => build(`Your laundry is ready — ${c(ctx, "order_code")}`, {
    preheader: "Fresh, folded and ready",
    heading: "Your laundry is ready",
    accent: TEAL,
    paragraphs: [`Great news — <strong>${c(ctx, "order_code")}</strong> is clean and ready. ${c(ctx, "return_line", "")}`],
    button: { label: "View order", url: String(ctx.track_url ?? "#"), tone: "ink" },
  }),

  out_for_delivery: (ctx) => build(`On its way to you — ${c(ctx, "order_code")}`, {
    preheader: "Your laundry is out for delivery",
    heading: "On its way to you",
    accent: CHAMP,
    paragraphs: [
      `Your order <strong>${c(ctx, "order_code")}</strong> is out for delivery.`,
      `${c(ctx, "pay_line", "")}`,
    ].filter((p) => p.replace(/<[^>]+>/g, "").trim().length),
    button: ctx.pay_url
      ? { label: `Pay now ${c(ctx, "total")}`, url: String(ctx.pay_url), tone: "champagne" }
      : { label: "Track delivery", url: String(ctx.track_url ?? "#"), tone: "ink" },
  }),

  payment_due: (ctx) => build(`Payment for ${c(ctx, "order_code")}`, {
    preheader: "Your order is ready to pay",
    heading: "Complete your payment",
    accent: CHAMP,
    paragraphs: [`Your order <strong>${c(ctx, "order_code")}</strong> is priced and ready.`],
    rows: [{ label: "Amount due", value: String(ctx.total ?? "—") }],
    button: { label: `Pay now ${c(ctx, "total")}`, url: String(ctx.pay_url ?? "#"), tone: "champagne" },
    note: "Payment is handled securely by Paystack.",
  }),

  payment_received: (ctx) => build(`Payment received — ${c(ctx, "order_code")}`, {
    preheader: "Thanks — we've received your payment",
    heading: "Payment received",
    accent: TEAL,
    paragraphs: [`We've received your payment for <strong>${c(ctx, "order_code")}</strong>. Thank you.`],
    rows: [{ label: "Amount paid", value: String(ctx.total ?? "—") }],
    button: { label: "View receipt", url: String(ctx.track_url ?? "#"), tone: "ink" },
  }),

  order_closed: (ctx) => build(`Order complete — ${c(ctx, "order_code")}`, {
    preheader: "Your order is complete",
    heading: "All done",
    accent: TEAL,
    paragraphs: [`Your order <strong>${c(ctx, "order_code")}</strong> is complete. We hope everything's perfect — thank you for using laundriroom.`],
    button: { label: "View invoice", url: String(ctx.track_url ?? "#"), tone: "ink" },
  }),

  item_type_requested: (ctx) => build(`New item type to review`, {
    preheader: "An attendant proposed a new item type",
    heading: "New item type to review",
    paragraphs: [`${c(ctx, "requested_by", "An attendant")} requested a new item type: <strong>${c(ctx, "item_name")}</strong>${ctx.price ? ` at ${c(ctx, "price")}` : ""}.`,
      `Approve or reject it from the vendor dashboard.`],
    button: { label: "Review requests", url: String(ctx.requests_url ?? "#"), tone: "ink" },
  }),

  item_type_approved: (ctx) => build(`Item type approved`, {
    preheader: "Your requested item type is live",
    heading: "Item type approved",
    accent: TEAL,
    paragraphs: [`<strong>${c(ctx, "item_name")}</strong> has been approved and added to the catalogue.`],
  }),

  payout_sent: (ctx) => build(`Your payout is on the way`, {
    preheader: "A payout has been released",
    heading: "Your payout is on the way",
    accent: TEAL,
    paragraphs: [`A payout has been released to <strong>${c(ctx, "vendor_name", "your account")}</strong>.`],
    rows: [{ label: "Amount", value: String(ctx.net ?? "—") }],
    button: { label: "View ledger", url: String(ctx.ledger_url ?? "#"), tone: "ink" },
  }),

  email_verification: (ctx) => build(`Verify your email for laundriroom`, {
    preheader: "Confirm your email to secure your account",
    heading: "Verify your email",
    paragraphs: [
      `Welcome to laundriroom${ctx.customer_name ? `, ${c(ctx, "customer_name")}` : ""}. Please confirm your email to secure your account.`,
      `You can keep placing orders in the meantime — this just keeps your account safe and your updates flowing.`,
    ],
    button: { label: "Verify email", url: String(ctx.verify_url ?? "#"), tone: "champagne" },
    note: "If you didn't create a laundriroom account, you can ignore this email.",
  }),

  email_verification_reminder: (ctx) => build(`Reminder: verify your laundriroom email`, {
    preheader: "A quick reminder to verify your email",
    heading: "Just a quick reminder",
    accent: WARN,
    paragraphs: [`Please verify your email so you don't miss order updates and receipts.`],
    button: { label: "Verify email", url: String(ctx.verify_url ?? "#"), tone: "champagne" },
  }),

  // ── Account & security (sent by the app through send-notification) ───────
  password_changed: (ctx) => build(`Your laundriroom password was changed`, {
    preheader: "Your password was just changed",
    heading: "Your password was changed",
    accent: TEAL,
    paragraphs: [
      `Hi ${c(ctx, "customer_name", "there")}, the password for your laundriroom account <strong>${c(ctx, "email")}</strong> was changed${ctx.changed_at ? ` on ${c(ctx, "changed_at")}` : ""}.`,
      `If this was you, there's nothing else to do.`,
    ],
    rows: [{ label: "Account", value: String(ctx.email ?? "—") }],
    button: { label: "Sign in", url: String(ctx.signin_url ?? "#"), tone: "ink" },
    note: `Didn't change it? Reset your password straight away and contact support — someone may have access to your account.`,
  }),

  account_updated: (ctx) => build(`Your laundriroom account details were updated`, {
    preheader: "Your account details changed",
    heading: "Your details were updated",
    paragraphs: [
      `Hi ${c(ctx, "customer_name", "there")}, we've updated your laundriroom account.`,
    ],
    rows: [
      { label: "What changed", value: String(ctx.changes ?? "Account details") },
      { label: "Account", value: String(ctx.email ?? "—") },
    ],
    button: { label: "Review your account", url: String(ctx.account_url ?? "#"), tone: "ink" },
    note: `Didn't make this change? Change your password and contact support.`,
  }),

  account_suspended: (ctx) => build(`Your laundriroom account has been suspended`, {
    preheader: "Your account is on hold",
    heading: "Your account is suspended",
    accent: WARN,
    paragraphs: [
      `Hi ${c(ctx, "customer_name", "there")}, your laundriroom account has been suspended, so you can't place or manage orders for now.`,
      ctx.reason ? `Reason: ${c(ctx, "reason")}` : `If you think this is a mistake, our support team can help.`,
    ],
    button: { label: "Contact support", url: String(ctx.support_url ?? "#"), tone: "ink" },
  }),

  account_reactivated: (ctx) => build(`Your laundriroom account is active again`, {
    preheader: "Welcome back",
    heading: "Your account is active again",
    accent: TEAL,
    paragraphs: [`Hi ${c(ctx, "customer_name", "there")}, your laundriroom account has been reactivated. You can sign in and order as usual.`],
    button: { label: "Sign in", url: String(ctx.signin_url ?? "#"), tone: "ink" },
  }),

  // ── Support alerts (to admins & support agents) ─────────────────────────
  ticket_opened: (ctx) => build(`New ticket #${c(ctx, "ticket_number")} — ${c(ctx, "subject")}`, {
    preheader: `${c(ctx, "customer_name", "A customer")} needs help`,
    heading: "New support ticket",
    accent: WARN,
    paragraphs: [
      `Hi ${c(ctx, "admin_name", "there")}, <strong>${c(ctx, "customer_name", "A customer")}</strong> opened a support ticket.`,
      ctx.message_excerpt ? `“${c(ctx, "message_excerpt")}”` : "",
    ].filter(Boolean),
    rows: [
      { label: "Ticket", value: `#${ctx.ticket_number ?? "—"}` },
      { label: "Subject", value: String(ctx.subject ?? "—") },
      { label: "Category", value: String(ctx.category ?? "—") },
      ...(ctx.order_code ? [{ label: "Order", value: String(ctx.order_code) }] : []),
      { label: "Customer", value: [ctx.customer_email, ctx.customer_phone].filter(Boolean).join(" · ") || "—" },
    ],
    button: { label: "Open ticket", url: String(ctx.ticket_url ?? "#"), tone: "ink" },
  }),

  ticket_message: (ctx) => build(`New reply on ticket #${c(ctx, "ticket_number")} — ${c(ctx, "subject")}`, {
    preheader: `${c(ctx, "customer_name", "The customer")} replied`,
    heading: "Customer replied",
    paragraphs: [
      `Hi ${c(ctx, "admin_name", "there")}, <strong>${c(ctx, "customer_name", "The customer")}</strong> replied on ticket #${c(ctx, "ticket_number")}.`,
      ctx.message_excerpt ? `“${c(ctx, "message_excerpt")}”` : "",
    ].filter(Boolean),
    rows: [
      { label: "Subject", value: String(ctx.subject ?? "—") },
      { label: "Status", value: String(ctx.ticket_status ?? "—") },
    ],
    button: { label: "Reply", url: String(ctx.ticket_url ?? "#"), tone: "ink" },
  }),

  // ── Support reply (to the customer) ──────────────────────────────────────
  ticket_reply: (ctx) => build(`Support replied to your ticket #${c(ctx, "ticket_number")}`, {
    preheader: "We've replied to your support request",
    heading: "We've replied",
    accent: TEAL,
    paragraphs: [
      `Hi ${c(ctx, "customer_name", "there")}, our support team replied to your ticket <strong>#${c(ctx, "ticket_number")} · ${c(ctx, "subject")}</strong>.`,
      ctx.message_excerpt ? `“${c(ctx, "message_excerpt")}”` : "",
    ].filter(Boolean),
    rows: [{ label: "Status", value: String(ctx.ticket_status ?? "—") }],
    button: { label: "View and reply", url: String(ctx.customer_ticket_url ?? "#"), tone: "ink" },
    note: "Reply in the app so the whole conversation stays in one place.",
  }),

  // ── Bad review (to the vendor's staff, and admins) ──────────────────────
  review_low: (ctx) => ctx.admin_name
    ? build(`${c(ctx, "rating")}★ review for ${c(ctx, "vendor_name")} — ${c(ctx, "order_code")}`, {
        preheader: `${c(ctx, "vendor_name")} received a ${c(ctx, "rating")}-star review`,
        heading: "Low rating flagged",
        accent: WARN,
        paragraphs: [
          `Hi ${c(ctx, "admin_name", "there")}, <strong>${c(ctx, "customer_name", "A customer")}</strong> gave <strong>${c(ctx, "vendor_name")}</strong> ${c(ctx, "rating")}★ for order <strong>${c(ctx, "order_code")}</strong>.`,
          `“${c(ctx, "review_comment")}”`,
          `The vendor has been asked to contact the customer and resolve it. Vendors with rising bad reviews show on the Vendor quality page.`,
        ],
        rows: [
          { label: "Vendor", value: String(ctx.vendor_name ?? "—") },
          ...(ctx.branch_line ? [{ label: "Branch", value: String(ctx.branch_line) }] : []),
          { label: "Customer", value: [ctx.customer_name, ctx.customer_phone].filter(Boolean).join(" · ") || "—" },
        ],
        button: { label: "Open Vendor quality", url: String(ctx.quality_url ?? "#"), tone: "ink" },
      })
    : build(`A customer rated order ${c(ctx, "order_code")} ${c(ctx, "rating")}★ — please follow up`, {
        preheader: "Please look into this review and reach out to the customer",
        heading: "A customer wasn't happy",
        accent: WARN,
        paragraphs: [
          `Hi ${c(ctx, "recipient_name", "there")}, <strong>${c(ctx, "customer_name", "A customer")}</strong> rated order <strong>${c(ctx, "order_code")}</strong> ${c(ctx, "rating")} out of 5.`,
          `“${c(ctx, "review_comment")}”`,
          `Please look into what happened, reach out to the customer to talk it through, and resolve it promptly. Quick, caring follow-up usually turns an unhappy customer around — and repeated low ratings are reviewed by laundriroom.`,
        ],
        rows: [
          { label: "Order", value: String(ctx.order_code ?? "—") },
          ...(ctx.branch_line ? [{ label: "Branch", value: String(ctx.branch_line) }] : []),
          { label: "Customer", value: [ctx.customer_name, ctx.customer_phone].filter(Boolean).join(" · ") || "—" },
        ],
        button: { label: "Open the order", url: String(ctx.order_url ?? ctx.reviews_url ?? "#"), tone: "ink" },
        note: "Tip: call or WhatsApp the customer first, then note what you did when you reply in the app.",
      }),

  // ── Review-quality steps (to the vendor's managers) ─────────────────────
  vendor_inquiry: (ctx) => build(`Your recent reviews on laundriroom`, {
    preheader: "We'd like to understand what's behind some recent reviews",
    heading: "Can you help us understand?",
    accent: WARN,
    paragraphs: [
      `Hi ${c(ctx, "recipient_name", "there")}, ${c(ctx, "vendor_name")} has had ${c(ctx, "bad_reviews_30", "some")} low rating(s) in the last 30 days, and we'd like to understand what's happening.`,
      ctx.action_message ? `“${c(ctx, "action_message")}”` : "",
      `Please reply from your dashboard with what went wrong and what you're doing about it.`,
    ].filter(Boolean),
    button: { label: "Reply in your dashboard", url: String(ctx.reviews_url ?? "#"), tone: "ink" },
  }),

  vendor_warning: (ctx) => build(`Warning: customer reviews at ${c(ctx, "vendor_name")}`, {
    preheader: "Low ratings are continuing — action is needed",
    heading: "This is a formal warning",
    accent: WARN,
    paragraphs: [
      `Hi ${c(ctx, "recipient_name", "there")}, low ratings at ${c(ctx, "vendor_name")} are continuing (${c(ctx, "bad_reviews_30", "several")} in the last 30 days).`,
      ctx.action_message ? `“${c(ctx, "action_message")}”` : "",
      `If customer reviews don't improve, your laundry may be suspended from laundriroom. Please reply from your dashboard with the steps you're taking.`,
    ].filter(Boolean),
    button: { label: "Respond now", url: String(ctx.reviews_url ?? "#"), tone: "ink" },
  }),

  vendor_suspended: (ctx) => build(`${c(ctx, "vendor_name")} has been suspended from laundriroom`, {
    preheader: "Your laundry can't take new orders on laundriroom",
    heading: "Your laundry is suspended",
    accent: WARN,
    paragraphs: [
      `Hi ${c(ctx, "recipient_name", "there")}, after repeated low customer ratings, ${c(ctx, "vendor_name")} has been suspended from laundriroom and can't take new orders.`,
      ctx.action_message ? `“${c(ctx, "action_message")}”` : "",
      `Orders already in progress should still be completed. Contact laundriroom support to discuss the next steps.`,
    ].filter(Boolean),
    button: { label: "Open your dashboard", url: String(ctx.support_url ?? "#"), tone: "ink" },
  }),

  // ── New order alert (to admins & the vendor's staff) ────────────────────
  order_placed: (ctx) => build(`New order ${c(ctx, "order_code")} — ${c(ctx, "vendor_name")}`, {
    preheader: `${c(ctx, "customer_name", "A customer")} placed an order`,
    heading: "New order",
    accent: CHAMP,
    paragraphs: [
      `Hi ${c(ctx, "recipient_name", "there")}, <strong>${c(ctx, "customer_name", "A customer")}</strong> placed order <strong>${c(ctx, "order_code")}</strong> with ${c(ctx, "vendor_name", "your laundry")}.`,
      ctx.notes ? `Customer note: “${c(ctx, "notes")}”` : "",
    ].filter(Boolean),
    rows: [
      { label: "Order", value: String(ctx.order_code ?? "—") },
      { label: "Customer", value: [ctx.customer_name, ctx.customer_phone].filter(Boolean).join(" · ") || "—" },
      ...(ctx.placed_by_line ? [{ label: "Entered by", value: String(ctx.placed_by_line) }] : []),
      ...(ctx.branch_line ? [{ label: "Branch", value: String(ctx.branch_line) }] : []),
      { label: "Getting it in", value: String(ctx.entry_line ?? "—") },
      ...(ctx.address_line ? [{ label: "Pickup address", value: String(ctx.address_line) }] : []),
      { label: "Getting it back", value: String(ctx.return_mode_line ?? "—") },
      { label: "Service", value: String(ctx.service_line ?? "—") },
      ...(ctx.extras_line ? [{ label: "Premium extras", value: String(ctx.extras_line) }] : []),
      { label: "Payment", value: String(ctx.payment_line ?? "—") },
    ],
    button: { label: "Open order", url: String(ctx.order_url ?? "#"), tone: "ink" },
    note: "Items are priced when they're checked in at the laundry.",
  }),
};

/** Undo esc() for plain-text parts (subject line, text body). */
function unesc(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function build(subject: string, b: Block) {
  // Values are escaped for the HTML; the subject and text part are plain text.
  return { subject: unesc(subject), html: renderEmail(b), text: unesc(toText(b)) };
}

/**
 * Supabase Auth emails (sign-up, password reset, email change…). Supabase
 * sends these itself because they carry its one-time links, so they're Go
 * templates: the {{ .X }} placeholders are filled in by Supabase.
 * `npm run emails:auth` writes them to supabase/templates/*.html; paste each
 * into Supabase → Authentication → Email Templates for the hosted project.
 */
export const AUTH_EMAIL_TEMPLATES: Record<string, { label: string; subject: string; html: string }> = (() => {
  // Supabase fills {{ .SiteURL }} with the project's Site URL (the app), which
  // serves the brand icon.
  const auth = (label: string, subject: string, b: Block) =>
    ({ label, subject, html: renderEmail(b, "{{ .SiteURL }}/brand/mark-email.png") });
  return {
    confirmation: auth("Confirm sign-up", "Confirm your laundriroom email", {
      preheader: "One tap to confirm your email",
      heading: "Confirm your email",
      paragraphs: [
        `Welcome to laundriroom. Confirm <strong>{{ .Email }}</strong> to secure your account and keep order updates flowing.`,
        `You can keep placing orders in the meantime.`,
      ],
      button: { label: "Confirm email", url: "{{ .ConfirmationURL }}", tone: "champagne" },
      note: "If you didn't create a laundriroom account, you can ignore this email.",
    }),
    recovery: auth("Reset password", "Reset your laundriroom password", {
      preheader: "Reset your password",
      heading: "Reset your password",
      accent: WARN,
      paragraphs: [
        `We got a request to reset the password for <strong>{{ .Email }}</strong>. Tap below to choose a new one.`,
        `The link works once and expires soon.`,
      ],
      button: { label: "Choose a new password", url: "{{ .ConfirmationURL }}", tone: "ink" },
      note: "Didn't ask for this? You can ignore this email — your password won't change.",
    }),
    magic_link: auth("Magic link", "Your laundriroom sign-in link", {
      preheader: "Your one-time sign-in link",
      heading: "Sign in to laundriroom",
      paragraphs: [`Tap below to sign in as <strong>{{ .Email }}</strong>. The link works once and expires soon.`],
      button: { label: "Sign in", url: "{{ .ConfirmationURL }}", tone: "ink" },
      note: "Didn't try to sign in? You can ignore this email.",
    }),
    email_change: auth("Change email address", "Confirm your new laundriroom email", {
      preheader: "Confirm your new email address",
      heading: "Confirm your new email",
      paragraphs: [
        `You asked to change your laundriroom email from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.`,
        `Confirm to finish the change. Until then, keep signing in with your current email.`,
      ],
      button: { label: "Confirm new email", url: "{{ .ConfirmationURL }}", tone: "champagne" },
      note: "Didn't ask for this? Ignore this email and change your password.",
    }),
    invite: auth("Invite user", "You've been invited to laundriroom", {
      preheader: "Your laundriroom account is ready",
      heading: "You've been invited",
      paragraphs: [`You've been invited to join laundriroom as <strong>{{ .Email }}</strong>. Accept to set your password and get started.`],
      button: { label: "Accept invitation", url: "{{ .ConfirmationURL }}", tone: "champagne" },
    }),
    reauthentication: auth("Verification code", "Your laundriroom verification code", {
      preheader: "Your one-time code",
      heading: "Confirm it's you",
      paragraphs: [
        `Enter this code to confirm a sensitive change to your account:`,
        `<span style="display:inline-block;font-family:Georgia,'Times New Roman',serif;font-size:30px;letter-spacing:8px;color:${INK};">{{ .Token }}</span>`,
      ],
      note: "Didn't request a code? Change your password and contact support.",
    }),
  };
})();

/** Fill Supabase's Go placeholders with sample values (for previews). */
export function sampleAuthEmail(html: string): string {
  return html
    .replace(/\{\{ \.ConfirmationURL \}\}/g, "#")
    .replace(/\{\{ \.NewEmail \}\}/g, "ada.new@example.com")
    .replace(/\{\{ \.Email \}\}/g, "ada@example.com")
    .replace(/\{\{ \.Token \}\}/g, "482913")
    .replace(/\{\{ \.SiteURL \}\}\/brand/g, "/brand")
    .replace(/\{\{ \.SiteURL \}\}/g, "#");
}

/** All event keys that have a template (handy for previews/tests). */
export const EMAIL_EVENTS = Object.keys(EMAIL_TEMPLATES);
