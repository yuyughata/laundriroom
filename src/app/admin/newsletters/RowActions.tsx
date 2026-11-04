"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateNewsletter, deleteNewsletter, createNewsletterDraft } from "./actions";

export function NewsletterRowActions({ id, draft }: { id: string; draft: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex justify-end gap-3 text-xs">
      <button className="text-ink underline" disabled={pending} onClick={() => start(async () => {
        const r = await duplicateNewsletter(id);
        if ("id" in r && r.id) router.push(`/admin/newsletters/${r.id}`); else window.alert(("error" in r && r.error) || "Couldn’t duplicate.");
      })}>Duplicate</button>
      {draft && (
        <button className="text-danger underline" disabled={pending} onClick={() => start(async () => {
          if (!window.confirm("Delete this draft?")) return;
          const r = await deleteNewsletter(id);
          if ("error" in r) window.alert(r.error); else router.refresh();
        })}>Delete</button>
      )}
    </div>
  );
}

/** Creates the draft first, then opens it — the editor always works on a saved newsletter. */
export function NewNewsletterButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn-primary text-sm" disabled={pending} onClick={() => start(async () => {
      const r = await createNewsletterDraft();
      if ("id" in r && r.id) router.push(`/admin/newsletters/${r.id}`); else window.alert(("error" in r && r.error) || "Couldn’t start a newsletter.");
    })}>{pending ? "Starting…" : "New newsletter"}</button>
  );
}
