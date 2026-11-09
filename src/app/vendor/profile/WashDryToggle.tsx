"use client";

import { useState, useTransition } from "react";
import { setOffersWashDry } from "../actions";

/** Vendor → My page: offer the flat-rate wash & dry only service, or not. */
export function WashDryToggle({ on }: { on: boolean }) {
  const [offered, setOffered] = useState(on);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button type="button" aria-pressed={offered} disabled={pending}
        className={`${offered ? "btn-primary" : "btn-ghost"} text-sm`}
        onClick={() => {
          setErr(null);
          const next = !offered;
          start(async () => {
            const r = await setOffersWashDry(next);
            if (r?.error) setErr(r.error); else setOffered(next);
          });
        }}>
        {offered ? "✓ Offering wash & dry only" : "Offer wash & dry only"}
      </button>
      <p className="mt-1 text-xs text-slate">{offered ? "Customers can choose it when they order from you." : "Not offered — customers get your full service only."}</p>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}
