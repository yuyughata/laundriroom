import sanitizeHtml from "sanitize-html";

/**
 * Clean a newsletter body from the editor down to what email clients render
 * reliably: paragraphs, two heading sizes, bold/italic/underline/strike,
 * lists, quotes, links, line breaks and dividers, with text alignment.
 * Everything else (scripts, styles, fonts, colours, images, pasted Word
 * markup) is removed. Server-side only; runs on every save.
 */
export function cleanNewsletterHtml(html: string): string {
  const out = sanitizeHtml(String(html || ""), {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "ul", "ol", "li", "a", "blockquote", "hr"],
    allowedAttributes: { a: ["href"], p: ["style"], h2: ["style"], h3: ["style"], li: ["style"] },
    allowedStyles: { "*": { "text-align": [/^(left|right|center|justify)$/] } },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      div: "p",
      h1: "h2",
      h4: "h3", h5: "h3", h6: "h3",
      b: "strong",
      i: "em",
      strike: "s",
    },
    // drop the tag but keep its text (e.g. <span>, <font>)
    disallowedTagsMode: "discard",
  });
  return out
    .replace(/<a>([\s\S]*?)<\/a>/g, "$1")                    // a link whose address was removed: keep the words
    .replace(/<p>(\s|&nbsp;|<br \/>|<br>)*<\/p>/g, "")       // empty paragraphs the editor leaves behind
    .trim();
}

/** A link a button can point to: http(s) only. */
export function cleanUrl(url: string): string | null {
  const u = String(url || "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
