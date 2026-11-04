"use client";

import { useState, useTransition } from "react";
import { setNewsletterOptOut } from "./newsletterActions";

/** "Email me news and offers" — the same switch the unsubscribe link turns off. */
export function NewsletterToggle({ optedOut }: { optedOut: boolean }) {
  const [on, setOn] = useState(!optedOut);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card flex items-center justify-between gap-4 p-4">
      <div>
        <p className="font-medium text-ink">News and offers by email</p>
        <p className="text-sm text-slate">Occasional newsletters and promo codes. Emails about your orders always come.</p>
        {err && <p className="mt-1 text-sm text-danger">{err}</p>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label="News and offers by email" disabled={pending}
        onClick={() => start(async () => {
          setErr(null);
          const next = !on;
          const r = await setNewsletterOptOut(!next);
          if (r?.error) setErr(r.error); else setOn(next);
        })}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-teal" : "bg-ink/20"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}
