"use client";

import { useState, useTransition } from "react";
import { reviewVendorDoc, setVendorKyc } from "./actions";

export function DocReview({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string } | void>) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) setErr(r.error);
    });
  }

  if (status !== "pending") {
    return (
      <button className="btn-ghost px-3 py-2 text-xs" disabled={pending}
        onClick={() => run(() => reviewVendorDoc(id, status !== "approved"))}>
        {status === "approved" ? "Mark rejected" : "Mark approved"}
      </button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-2 text-xs" disabled={pending}
          onClick={() => run(() => reviewVendorDoc(id, true))}>Approve</button>
        <button className="btn-ghost px-3 py-2 text-xs" disabled={pending}
          onClick={() => run(() => reviewVendorDoc(id, false))}>Reject</button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}

export function KycToggle({ vendorId, verified }: { vendorId: string; verified: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className={verified ? "btn-ghost px-3 py-2 text-xs" : "btn-primary px-3 py-2 text-xs"}
      disabled={pending}
      onClick={() => start(() => setVendorKyc(vendorId, !verified).then(() => {}))}>
      {verified ? "Unverify" : "Mark verified"}
    </button>
  );
}
