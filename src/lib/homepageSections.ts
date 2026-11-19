/**
 * Custom homepage sections (migration 0056). Admins add/duplicate these in
 * Admin → Homepage; they render on the landing page just above the final CTA,
 * as native-looking bands. `renderHomepageSections` turns the rows into the
 * same HTML/CSS the rest of the landing page uses.
 */

export type HomeSectionRow = {
  id: string;
  position: number;
  eyebrow: string | null;
  heading: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  tone: "light" | "dark" | string;
  active: boolean;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

/** Only allow safe link targets (relative, anchor, http/https, mailto). */
function safeHref(href: string): string | null {
  const h = href.trim();
  if (!h) return null;
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(h)) return h;
  return null;
}

function sectionHTML(r: HomeSectionRow): string {
  const dark = r.tone === "dark";
  const secStyle = dark ? ' style="background:var(--ink);border-radius:36px;margin:0 16px"' : "";
  const headStyle = dark ? ' style="color:var(--ivory)"' : "";
  const pStyle = dark ? ' style="color:rgba(248,245,239,.72)"' : "";

  const eyebrow = r.eyebrow?.trim() ? `<span class="eyebrow">${esc(r.eyebrow.trim())}</span>` : "";
  const heading = `<h2 class="display"${headStyle}>${esc((r.heading || "").trim())}</h2>`;
  const body = r.body?.trim()
    ? `<p${pStyle}>${esc(r.body.trim()).replace(/\n+/g, "<br/>")}</p>`
    : "";

  const href = r.cta_href ? safeHref(r.cta_href) : null;
  const cta = r.cta_label?.trim() && href
    ? `<div class="center" style="margin-top:28px"><a class="btn ${dark ? "btn-accent" : "btn-primary"}" href="${escAttr(href)}">${esc(r.cta_label.trim())}</a></div>`
    : "";

  return `<section class="band"${secStyle}><div class="wrap">` +
    `<div class="sec-head center">${eyebrow}${heading}${body}</div>${cta}` +
    `</div></section>`;
}

export function renderHomepageSections(rows: HomeSectionRow[]): string {
  return rows
    .filter((r) => r.active && (r.heading || "").trim())
    .sort((a, b) => a.position - b.position)
    .map(sectionHTML)
    .join("\n");
}
