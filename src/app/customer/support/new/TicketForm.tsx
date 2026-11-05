"use client";

import { useState } from "react";
import { createTicket } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SUPPORT_CATEGORIES } from "@/lib/support";
import { PhotoAttach, uploadSupportPhotos } from "@/components/support/PhotoAttach";

type OrderOpt = { id: string; code: string };

export function TicketForm({ orders }: { orders: OrderOpt[] }) {
  const [category, setCategory] = useState(SUPPORT_CATEGORIES[0].category);
  const [subcategory, setSubcategory] = useState(SUPPORT_CATEGORIES[0].subcategories[0]);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);

  const subs = SUPPORT_CATEGORIES.find((c) => c.category === category)?.subcategories ?? ["Other"];
  const needsOther = category === "Other" || subcategory === "Other";

  async function onSubmit(formData: FormData) {
    setError(null);
    const up = await uploadSupportPhotos(photos);
    if ("error" in up) { setError(up.error); return; }
    formData.set("attachments", JSON.stringify(up.paths));
    const res = await createTicket(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={onSubmit} className="mt-6 space-y-5">
      <div>
        <label className="label">Category</label>
        <select name="category" className="field" value={category}
          onChange={(e) => {
            const c = e.target.value;
            setCategory(c);
            setSubcategory(SUPPORT_CATEGORIES.find((x) => x.category === c)?.subcategories[0] ?? "Other");
          }}>
          {SUPPORT_CATEGORIES.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}
        </select>
      </div>

      {category !== "Other" && (
        <div>
          <label className="label">Subcategory</label>
          <select name="subcategory" className="field" value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}>
            {subs.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      {category === "Other" && <input type="hidden" name="subcategory" value="Other" />}

      {needsOther && (
        <div>
          <label className="label">Tell us more</label>
          <input name="other_text" className="field" placeholder="Briefly describe your issue" />
        </div>
      )}

      {orders.length > 0 && (
        <div>
          <label className="label">Related order (optional)</label>
          <select name="order_id" className="field" defaultValue="">
            <option value="">Not about a specific order</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="label">Subject</label>
        <input name="subject" className="field" placeholder="A short summary" maxLength={120} />
      </div>

      <div>
        <label className="label">Describe the issue</label>
        <textarea name="message" rows={5} className="field" placeholder="What happened? Include any details that help us resolve it." />
        <p className="mt-2 text-xs text-slate">Photos help us see the problem — a stain, damage, a missing item. Up to 4.</p>
        <PhotoAttach files={photos} onChange={setPhotos} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <SubmitButton className="btn-accent w-full">Submit request</SubmitButton>
    </form>
  );
}
