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

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The shared layout. Renders a full HTML email document. */
export function renderEmail(b: Block): string {
  const accent = b.accent ?? CHAMP;
  const rows = b.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-collapse:collapse;">
        ${b.rows.map((r) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #ECE7DD;color:${SLATE};font-size:14px;">${esc(r.label)}</td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #ECE7DD;color:${INK};font-size:14px;font-weight:600;">${esc(r.value)}</td>
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
      <!-- header -->
      <tr><td style="padding:4px 4px 20px;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:700;color:${INK};letter-spacing:-.3px;">laundriroom</span>
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
};

function build(subject: string, b: Block) {
  return { subject, html: renderEmail(b), text: toText(b) };
}

/** All event keys that have a template (handy for previews/tests). */
export const EMAIL_EVENTS = Object.keys(EMAIL_TEMPLATES);
