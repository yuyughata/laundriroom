import { createClient } from "@/lib/supabase/server";
import { toParagraphs, type AgreementClause } from "@/lib/legal";

/**
 * Public legal documents (Privacy Policy, Terms of Use, Privacy Choices) —
 * admin-editable clauses in `legal_clauses` (migration 0052), mirroring the
 * Partner Agreement. Linked from the homepage footer and the sign-up form.
 */

export type LegalDocSlug = "privacy" | "terms" | "cookies";

export const LEGAL_DOCS: { slug: LegalDocSlug; title: string; footerLabel: string; intro: string }[] = [
  { slug: "privacy", title: "Privacy Policy", footerLabel: "Privacy Policy",
    intro: "How laundriroom collects, uses and protects your information." },
  { slug: "terms", title: "Terms of Use", footerLabel: "Terms of Use",
    intro: "The terms you agree to when you use laundriroom." },
  { slug: "cookies", title: "Privacy Choices", footerLabel: "Privacy Choices",
    intro: "Cookies and the privacy choices available to you." },
];

export function isLegalDoc(slug: string): slug is LegalDocSlug {
  return LEGAL_DOCS.some((d) => d.slug === slug);
}

export function legalDocMeta(slug: LegalDocSlug) {
  return LEGAL_DOCS.find((d) => d.slug === slug)!;
}

/** Acceptance wording for the customer sign-up checkbox. */
export const CUSTOMER_TERMS_ACCEPT = "I agree to the Terms of Use and Privacy Policy.";

/** Minimal fallback shown if nothing is stored yet (before 0052 is applied). */
function fallback(slug: LegalDocSlug): AgreementClause[] {
  const m = legalDocMeta(slug);
  return [{ id: `default-${slug}`, title: m.title, paragraphs: [
    `${m.intro} This document is being finalised — please check back soon, or contact hello@laundriroom.app with any questions.`,
  ] }];
}

/** Active clauses for one legal document, in order, plus when it last changed. */
export async function getLegalDoc(slug: LegalDocSlug): Promise<{ clauses: AgreementClause[]; updatedAt: string | null }> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("legal_clauses" as never)
      .select("id, title, body, updated_at, position")
      .eq("doc", slug).eq("active", true).order("position");
    const rows = (data ?? []) as { id: string; title: string; body: string; updated_at: string }[];
    const clauses = rows
      .map((r) => ({ id: r.id, title: r.title, paragraphs: toParagraphs(r.body) }))
      .filter((c) => c.paragraphs.length > 0);
    const updatedAt = rows.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);
    return { clauses: clauses.length ? clauses : fallback(slug), updatedAt };
  } catch {
    return { clauses: fallback(slug), updatedAt: null };
  }
}
