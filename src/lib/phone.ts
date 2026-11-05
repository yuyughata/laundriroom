/** Same as the database's phone_key(): digits only, 0XXXXXXXXXX → 234XXXXXXXXXX. */
export function phoneKey(p: string | null | undefined): string {
  const d = String(p ?? "").replace(/\D/g, "");
  return /^0\d{10}$/.test(d) ? `234${d.slice(1)}` : d;
}

/** A tap-to-call link. */
export function telHref(p: string): string {
  return `tel:${String(p).replace(/[^\d+]/g, "")}`;
}

/** A WhatsApp chat link (international digits), optionally with a message. */
export function whatsappHref(p: string, text?: string): string {
  return `https://wa.me/${phoneKey(p)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
