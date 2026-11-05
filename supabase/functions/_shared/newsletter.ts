/**
 * Newsletter email — "Ink & Ivory", same look as the transactional emails.
 *
 *   [header image]  →  body (rich text)  →  [call-to-action button]  →  [footer image]
 *   then the brand line and an unsubscribe link.
 *
 * Pure string-building with no imports, so the same file is mirrored into the
 * edge function (supabase/functions/_shared/newsletter.ts — keep both in sync)
 * and used by the in-app preview. The body is HTML that was already cleaned to
 * a small allowlist when it was saved (src/lib/newsletterHtml.ts); here it only
 * gets the inline styles email clients need.
 */

export type NewsletterContent = {
  subject: string;
  preheader?: string | null;
  headerImageUrl?: string | null;
  footerImageUrl?: string | null;
  bodyHtml: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

const INK = "#0F1B2D";
const IVORY = "#F8F5EF";
const CHAMP = "#C6A664";
const SLATE = "#5B6678";
const BODY = "#2B3A52";
const FONT = "Arial,Helvetica,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Inline styles for each allowed tag (email clients ignore <style> blocks). */
const TAG_STYLE: Record<string, string> = {
  p: `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${BODY};`,
  h2: `margin:8px 0 12px;font-family:${SERIF};font-size:24px;line-height:1.3;font-weight:700;color:${INK};`,
  h3: `margin:8px 0 10px;font-family:${SERIF};font-size:19px;line-height:1.35;font-weight:700;color:${INK};`,
  ul: `margin:0 0 16px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.65;color:${BODY};`,
  ol: `margin:0 0 16px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.65;color:${BODY};`,
  li: `margin:0 0 6px;`,
  blockquote: `margin:0 0 16px;padding:4px 0 4px 16px;border-left:3px solid ${CHAMP};font-family:${FONT};font-size:16px;line-height:1.65;color:${SLATE};font-style:italic;`,
  a: `color:${INK};text-decoration:underline;`,
  hr: `border:0;border-top:1px solid #ECE7DD;margin:20px 0;`,
};

/** Add inline styles to the cleaned body HTML, keeping text alignment and links. */
export function styleBody(html: string): string {
  return String(html || "").replace(/<(p|h2|h3|ul|ol|li|blockquote|a|hr)(\s[^>]*)?>/gi, (_m, rawTag: string, attrs = "") => {
    const tag = rawTag.toLowerCase();
    const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(attrs)?.[1];
    const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    const style = TAG_STYLE[tag] + (align ? `text-align:${align.toLowerCase()};` : "");
    if (tag === "a") return `<a href="${href ?? "#"}" target="_blank" style="${style}">`;
    if (tag === "hr") return `<hr style="${style}">`;
    return `<${tag} style="${style}">`;
  });
}

/** Plain-text version (for clients that prefer text, and spam filters). */
export function newsletterText(c: NewsletterContent, unsubscribeUrl = UNSUBSCRIBE_PLACEHOLDER): string {
  const body = String(c.bodyHtml || "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|h2|h3|li|blockquote|ul|ol)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
  const lines = [body];
  if (c.ctaLabel && c.ctaUrl) lines.push("", `${c.ctaLabel}: ${c.ctaUrl}`);
  lines.push("", "— laundriroom", `Unsubscribe: ${unsubscribeUrl}`);
  return lines.join("\n");
}

/** The full HTML email. `unsubscribeUrl` is filled per recipient by the sender. */
export function renderNewsletter(c: NewsletterContent, opts: { iconUrl: string; unsubscribeUrl?: string }): string {
  const unsub = opts.unsubscribeUrl ?? UNSUBSCRIBE_PLACEHOLDER;
  const img = (url: string, alt: string) =>
    `<img src="${esc(url)}" width="560" alt="${esc(alt)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;outline:none;text-decoration:none;">`;

  const header = c.headerImageUrl
    ? `<tr><td style="padding:0;line-height:0;font-size:0;">${img(c.headerImageUrl, c.subject)}</td></tr>`
    : `<tr><td style="height:4px;background:${CHAMP};line-height:4px;font-size:0;">&nbsp;</td></tr>`;

  const button = c.ctaLabel && c.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 4px;">
        <tr><td style="border-radius:999px;background:${INK};">
          <a href="${esc(c.ctaUrl)}" target="_blank"
             style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:600;color:${IVORY};text-decoration:none;border-radius:999px;">${esc(c.ctaLabel)}</a>
        </td></tr>
       </table>`
    : "";

  const footerImg = c.footerImageUrl
    ? `<tr><td style="padding:0;line-height:0;font-size:0;">${img(c.footerImageUrl, "")}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${IVORY};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader || "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:28px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="padding:4px 4px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:9px;vertical-align:middle;">
            <img src="${esc(opts.iconUrl)}" width="32" height="24" alt="" style="display:block;width:32px;height:24px;border:0;">
          </td>
          <td style="vertical-align:middle;">
            <span style="font-family:${FONT};font-size:21px;font-weight:700;color:${INK};letter-spacing:-.3px;">laundriroom</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid #EFEAE0;border-radius:16px;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${header}
          <tr><td style="padding:30px 32px 28px;">
            ${styleBody(c.bodyHtml)}
            ${button}
          </td></tr>
          ${footerImg}
        </table>
      </td></tr>
      <tr><td style="padding:22px 8px;">
        <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;color:${SLATE};">laundriroom — laundry, handled.</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;color:${SLATE};">You're receiving this because you have a laundriroom account.
          <a href="${esc(unsub)}" target="_blank" style="color:${SLATE};text-decoration:underline;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
