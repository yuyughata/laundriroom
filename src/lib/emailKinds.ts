/** Kinds of email broadcast (Admin → Emails). A newsletter is one of them. */
export type EmailKind = "newsletter" | "promotion" | "announcement" | "update";

export const EMAIL_KINDS: { key: EmailKind; label: string; hint: string }[] = [
  { key: "newsletter", label: "Newsletter", hint: "News and stories, sent regularly" },
  { key: "promotion", label: "Promotion", hint: "An offer or promo code" },
  { key: "announcement", label: "Announcement", hint: "Something new: a laundry, area or feature" },
  { key: "update", label: "Service update", hint: "Hours, holidays, changes to the service" },
];

export const EMAIL_KIND_LABEL: Record<EmailKind, string> =
  Object.fromEntries(EMAIL_KINDS.map((k) => [k.key, k.label])) as Record<EmailKind, string>;

export function isEmailKind(v: unknown): v is EmailKind {
  return EMAIL_KINDS.some((k) => k.key === v);
}
