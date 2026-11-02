"use client";

import { useState, useTransition } from "react";
import { setPaymentProvider } from "../actions";

export function PaymentsCard({ current }: { current: "paystack" | "flutterwave" }) {
  const [provider, setProvider] = useState(current);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="card p-5">
      <p className="font-display text-lg text-ink">Payments</p>
      <p className="mt-0.5 text-xs text-slate">
        The platform collects every order payment online; pay-on-delivery is optional per order.
      </p>

      <label className="label mt-4">Provider</label>
      <select className="field" value={provider}
        onChange={(e) => { setProvider(e.target.value as typeof provider); setSaved(false); }}>
        <option value="paystack">Paystack</option>
        <option value="flutterwave">Flutterwave</option>
      </select>

      <button className="btn-primary mt-3 text-sm" disabled={pending}
        onClick={() => start(async () => { await setPaymentProvider(provider); setSaved(true); })}>
        Save provider
      </button>
      {saved && <span className="ml-3 text-xs text-teal">Saved.</span>}

      <p className="mt-4 text-xs text-slate">
        Secret keys live in the server&apos;s edge-function secrets (PAYSTACK_SECRET_KEY /
        FLUTTERWAVE_SECRET_KEY), never in the browser. Point the provider&apos;s webhook at the
        matching function.
      </p>
    </div>
  );
}
