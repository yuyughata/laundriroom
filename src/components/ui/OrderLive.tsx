"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the customer's order page in sync with the laundry: when staff advance a
 * stage, check items in, or a payment lands, the open page updates within a few
 * seconds instead of needing a manual reload.
 *
 * It polls a tiny server endpoint (`/api/orders/[id]/status`) that returns a
 * signature of the fields this page shows. The endpoint runs server-side with
 * the caller's session, so it reads the true current state (no stale client
 * cache, and RLS still limits it to this customer's order). When the signature
 * differs from what the server rendered, it reloads the page — which always
 * re-renders with fresh data. It polls every few seconds and also checks the
 * moment the tab regains focus. Renders nothing.
 */
export function OrderLive({ orderId, signature }: { orderId: string; signature: string }) {
  // Track the server-rendered signature; refresh the ref if the page re-renders.
  const current = useRef(signature);
  current.current = signature;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // A finished order won't change on the laundry's side — no need to poll.
    if (/^(closed|cancelled)\|/.test(current.current)) return;
    let stopped = false;
    let reloading = false;

    async function check() {
      if (stopped || reloading || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const { sig } = (await res.json()) as { sig: string | null };
        if (sig && sig !== current.current) {
          reloading = true;
          window.location.reload();
        }
      } catch { /* transient — try again next tick */ }
    }

    const onFocus = () => check();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const poll = setInterval(check, 5000);

    return () => {
      stopped = true;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [orderId]);

  return null;
}
