/**
 * Partner Agreement copy. The agreement itself is a list of clauses admins
 * manage at Admin → Partner agreement (table agreement_clauses, migration
 * 0034); this file holds the title, the checkbox wording, and the default
 * clause used if the database has none (e.g. before 0034 is applied).
 * Vendors accept it at /apply and again in-app at Vendor → Verification.
 */

export const PARTNER_AGREEMENT_TITLE = "Partner Agreement";

/** Checkbox / acceptance wording. */
export const PARTNER_AGREEMENT_ACCEPT =
  "I have read and agree to the laundriroom Partner Agreement above.";

export type AgreementClause = { id: string; title: string; paragraphs: string[] };

/** Fallback when no clauses are stored yet: the original non-circumvention clause. */
export const DEFAULT_AGREEMENT: AgreementClause[] = [
  {
    id: "default-non-circumvention",
    title: "Non-circumvention",
    paragraphs: [
      "Customers introduced to you through laundriroom are platform customers. For twelve (12) months from a customer’s first order placed with you via laundriroom, you agree to transact all laundry services for that customer through the laundriroom platform.",
      "You will not solicit, divert, or accept such customers’ orders, payments, or contact outside the platform — directly or indirectly, and whether in cash or otherwise — during that period.",
      "Breach may result in withheld or reversed payouts, commission adjustments to recover lost platform fees, suspension, de-listing, and recovery of damages. This obligation survives termination for the period stated and is enforceable against the verified business and its principals named in your ID and CAC records.",
    ],
  },
];

/** Split a stored clause body into paragraphs (blank-line separated). */
export function toParagraphs(body: string): string[] {
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** Total paragraphs across the agreement — used to decide when to make it scrollable. */
export function paragraphCount(clauses: AgreementClause[]): number {
  return clauses.reduce((n, c) => n + c.paragraphs.length, 0);
}
