import { telHref, whatsappHref } from "@/lib/phone";

export type OrderContact = {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address_label?: string | null;
  address_line?: string | null;
  address_area?: string | null;
  address_city?: string | null;
};

/**
 * Customer contact for an order — shown on the admin and vendor order pages so
 * staff can follow up on incomplete orders. Call / WhatsApp / email the
 * customer directly, with the order code prefilled into the WhatsApp message.
 */
export function OrderContactCard({ contact, orderCode }: { contact: OrderContact | null; orderCode?: string }) {
  const name = contact?.full_name || "Customer";
  const phone = contact?.phone || null;
  const email = contact?.email || null;
  const addressParts = [contact?.address_line, contact?.address_area, contact?.address_city].filter(Boolean);
  const waText = orderCode ? `Hello ${name}, regarding your laundriroom order ${orderCode}:` : undefined;

  return (
    <div className="rounded-card border border-ink/10 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg text-ink">Customer contact</h2>
        <span className="text-xs text-slate">for follow-up</span>
      </div>

      <p className="mt-2 text-sm font-medium text-ink">{name}</p>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate">Phone</dt>
          <dd className="text-ink">{phone ?? <span className="text-slate">Not provided</span>}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate">Email</dt>
          <dd className="truncate text-ink">{email ?? <span className="text-slate">Not provided</span>}</dd>
        </div>
        {addressParts.length > 0 && (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-slate">Address</dt>
            <dd className="text-right text-ink">
              {contact?.address_label && <span className="block text-xs text-slate">{contact.address_label}</span>}
              {addressParts.join(", ")}
            </dd>
          </div>
        )}
      </dl>

      {(phone || email) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {phone && (
            <a href={telHref(phone)} className="btn-ghost px-3 py-2 text-xs">Call</a>
          )}
          {phone && (
            <a href={whatsappHref(phone, waText)} target="_blank" rel="noopener noreferrer"
              className="btn-ghost px-3 py-2 text-xs">WhatsApp</a>
          )}
          {email && (
            <a href={`mailto:${email}${orderCode ? `?subject=${encodeURIComponent(`laundriroom order ${orderCode}`)}` : ""}`}
              className="btn-ghost px-3 py-2 text-xs">Email</a>
          )}
        </div>
      )}
    </div>
  );
}
