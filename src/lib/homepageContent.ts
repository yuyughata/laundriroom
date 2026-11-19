/**
 * Editable homepage/landing content.
 *
 * The landing page (src/app/page.tsx) is a block of static HTML. Rather than
 * rewrite it, we treat each editable phrase as a "field" with its current copy
 * as the default. Admin overrides are stored in the `homepage_content` table
 * (key → value); at render time we swap the default text for the override in
 * the markup. A missing/blank override just leaves the default in place, so the
 * page can never break. Admins edit these at Admin → Homepage.
 *
 * Only plain-text phrases are editable here (headings, paragraphs, button
 * labels). Bits with embedded links, and the illustrative in-page phone/desktop
 * mock-ups, stay in the page source.
 */

export type HomeField = {
  key: string;
  label: string;
  /** The exact copy as it appears on the page today; also the fallback. */
  default: string;
  /** Render a textarea instead of a single-line input. */
  multiline?: boolean;
  /** Short helper shown under the field. */
  hint?: string;
};

export type HomeSection = { title: string; note?: string; fields: HomeField[] };

export const HOMEPAGE_SECTIONS: HomeSection[] = [
  {
    title: "Header & navigation",
    fields: [
      { key: "nav_how", label: "Nav: How it works", default: "How it works", hint: "Also the 'How it works' section heading and footer link." },
      { key: "nav_quality", label: "Nav: Quality", default: "Quality" },
      { key: "nav_vendors", label: "Nav: For laundries", default: "For laundries" },
      { key: "btn_signin", label: "Button: Sign in", default: "Sign in" },
      { key: "btn_partner", label: "Button: Become a partner", default: "Become a partner" },
    ],
  },
  {
    title: "Hero",
    fields: [
      { key: "hero_title", label: "Headline", default: "Laundry, handled." },
      { key: "hero_lede", label: "Sub-headline", multiline: true,
        default: "Book a pickup or drop off at the nearest station. Track every item, pay in the app, and have it brought back pressed and folded." },
      { key: "hero_cta_primary", label: "Primary button", default: "Create an account" },
      { key: "hero_card1_title", label: "Card 1 title", default: "Book in seconds" },
      { key: "hero_card1_text", label: "Card 1 text", default: "Pickup or drop-off, a time slot, and a nearby laundry." },
      { key: "hero_card2_title", label: "Card 2 title", default: "Track every item" },
      { key: "hero_card2_text", label: "Card 2 text", default: "Each garment gets its own tag and sub-ID you can follow." },
      { key: "hero_card3_title", label: "Card 3 title", default: "Pay your way" },
      { key: "hero_card3_text", label: "Card 3 text", default: "Online before delivery, or tap Pay now at the door." },
    ],
  },
  {
    title: "Why laundriroom",
    fields: [
      { key: "why_eyebrow", label: "Eyebrow", default: "Why laundriroom" },
      { key: "why_title", label: "Heading", default: "Laundry that fits your life" },
      { key: "why_sub", label: "Sub-text", multiline: true,
        default: "Convenient to book, easy to reach, and genuinely off your plate once you've handed it over." },
      { key: "pillar1_title", label: "Pillar 1 title", default: "Convenience" },
      { key: "pillar1_text", label: "Pillar 1 text", multiline: true,
        default: "However you want it. Pickup from your door or drop off on your way — booked in under a minute." },
      { key: "pillar2_title", label: "Pillar 2 title", default: "Accessibility" },
      { key: "pillar2_text", label: "Pillar 2 text", multiline: true,
        default: "Get your laundry picked up and delivered from any part of the city — even if you can't find a laundriroom station near you." },
      { key: "pillar3_title", label: "Pillar 3 title", default: "Rest of mind" },
      { key: "pillar3_text", label: "Pillar 3 text", multiline: true,
        default: "Every garment is tagged and tracked. You see each stage, and a PIN confirms a safe handover." },
    ],
  },
  {
    title: "How it works",
    fields: [
      { key: "how_title", label: "Heading", default: "From pile to pressed, in four steps" },
      { key: "how_sub", label: "Sub-text", multiline: true,
        default: `A simple path from "I need this cleaned" to fresh clothes back in your hands.` },
      { key: "step1_text", label: "Step 1 (Discover) text", multiline: true,
        default: "Find the nearest verified laundry in Jos and see live prices — no hidden charges." },
      { key: "step2_text", label: "Step 2 (Book) text", multiline: true,
        default: "Choose pickup or drop-off, your service and turnaround, and see one clean price. Done in seconds." },
      { key: "step3_text", label: "Step 3 (Track) text", multiline: true,
        default: "Every item is tagged and moves through each stage — follow it live, right up to the handover PIN." },
      { key: "step4_text", label: "Step 4 (Delivered) text", multiline: true,
        default: "Pressed and folded, back at your door. Confirm with your PIN, rate the laundry, and reorder in a tap." },
    ],
  },
  {
    title: "Quality band",
    fields: [
      { key: "quality_eyebrow", label: "Eyebrow", default: "Simple. Efficient. Satisfying." },
      { key: "quality_title", label: "Heading", default: "Clean clothes, delivered right — every time" },
      { key: "quality_text", label: "Text", multiline: true,
        default: "We keep it simple and get it done: collected on time, cleaned to standard, and brought back when we say. If something's not right, we make it right." },
    ],
  },
  {
    title: "For laundries",
    fields: [
      { key: "vendor_eyebrow", label: "Eyebrow", default: "For laundry businesses" },
      { key: "vendor_title", label: "Heading", default: "Grow your laundry, we'll handle the rest" },
      { key: "vendor_sub", label: "Sub-text", multiline: true,
        default: "Reach more customers, run a tighter operation, and get paid reliably — all from one dashboard built for the way laundries actually work." },
      { key: "vendor_btn", label: "Button", default: "Apply to partner →" },
      { key: "vcard1_title", label: "Card 1 title", default: "Visibility" },
      { key: "vcard1_text", label: "Card 1 text", multiline: true,
        default: "Get discovered by customers near you and build a reputation that brings them back." },
      { key: "vcard2_title", label: "Card 2 title", default: "Operational efficiency" },
      { key: "vcard2_text", label: "Card 2 text", multiline: true,
        default: "Tag items, move them through each stage, scan, and assign a rider — nothing slips." },
      { key: "vcard3_title", label: "Card 3 title", default: "Financial management" },
      { key: "vcard3_text", label: "Card 3 text", multiline: true,
        default: "See what you've earned, keep the books, and get paid on a clear, automatic schedule." },
      { key: "vendor_cta_note", label: "Button note", default: "Free to join · no setup fees · keep your prices" },
    ],
  },
  {
    title: "Final call-to-action",
    fields: [
      { key: "final_title", label: "Heading", default: "Ready for laundry off your plate?" },
      { key: "final_text", label: "Text", default: "Book a pickup today and get your time back." },
      { key: "final_cta_primary", label: "Primary button", default: "Book a pickup or drop off →" },
      { key: "final_cta_secondary", label: "Secondary button", default: "See how it works" },
    ],
  },
  {
    title: "Footer",
    fields: [
      { key: "footer_tagline", label: "Tagline", multiline: true,
        default: "Pickup & delivery laundry that's simple, tracked, and reliable — for customers and the laundries that serve them." },
      { key: "footer_copyright", label: "Copyright line", default: "© 2026 laundriroom. All rights reserved." },
      { key: "footer_location", label: "Location line", default: "Jos, Plateau State · hello@laundriroom.app" },
    ],
  },
];

export const HOMEPAGE_FIELDS: HomeField[] = HOMEPAGE_SECTIONS.flatMap((s) => s.fields);

/** Minimal HTML-text escaping — matches how the landing markup encodes text. */
function enc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Swap admin overrides into the landing markup. Longest defaults first so a
 * shorter phrase can't partially clobber a longer one that contains it. Only
 * phrases that actually changed are replaced.
 */
export function applyHomepageContent(markup: string, overrides: Record<string, string>): string {
  const fields = HOMEPAGE_FIELDS.slice().sort((a, b) => b.default.length - a.default.length);
  let out = markup;
  for (const f of fields) {
    const val = (overrides[f.key] ?? "").trim();
    if (!val || val === f.default) continue;
    out = out.split(enc(f.default)).join(enc(val));
  }
  return out;
}
