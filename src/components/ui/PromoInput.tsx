"use client";

import { useState, useTransition } from "react";
import { applyPromo } from "@/app/customer/actions";

export function PromoInput({ orderId }: { orderId: string }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="card p-4">
      <p className="label">Have a promo code?</p>
      <div className="flex gap-2">
        <input className="field uppercase" placeholder="Enter code" value={code}
          onChange={(e) => setCode(e.target.value)} />
        <button className="btn-primary" disabled={pending || !code.trim()}
          onClick={() => start(async () => {
            setErr(null);
            const r = await applyPromo(orderId, code);
            if (r?.error) setErr(r.error); else setCode("");
          })}>
          Apply
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}
