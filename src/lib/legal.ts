/**
 * Shared legal copy. The non-circumvention clause is surfaced to vendors at
 * application time (/apply) and again in-app alongside KYC (Vendor →
 * Verification), so acceptance is recorded and tied to a verified business.
 */

export const NON_CIRCUMVENTION_TITLE = "Non-circumvention";

/** Short line for checkboxes / summaries. */
export const NON_CIRCUMVENTION_SHORT =
  "I agree to the laundriroom Vendor Agreement, including the non-circumvention clause: customers introduced through the platform are transacted on the platform.";

/** Full clause, shown in the agreement panel. */
export const NON_CIRCUMVENTION_CLAUSE = [
  "Customers introduced to you through laundriroom are platform customers. For twelve (12) months from a customer’s first order placed with you via laundriroom, you agree to transact all laundry services for that customer through the laundriroom platform.",
  "You will not solicit, divert, or accept such customers’ orders, payments, or contact outside the platform — directly or indirectly, and whether in cash or otherwise — during that period.",
  "Breach may result in withheld or reversed payouts, commission adjustments to recover lost platform fees, suspension, de-listing, and recovery of damages. This obligation survives termination for the period stated and is enforceable against the verified business and its principals named in your ID and CAC records.",
] as const;
