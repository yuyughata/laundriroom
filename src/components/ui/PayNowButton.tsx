"use client";

import { useState, useTransition } from "react";
import { payNow } from "@/app/customer/actions";

export function PayNowButton({ orderId, label }: { orderId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn-accent w-full"
        disabled={pending}
        onClick={() => start(async () => {
          const res = await payNow(orderId);
          if (res?.error) setError(res.error);
        })}>
        {pending ? "Starting payment…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
