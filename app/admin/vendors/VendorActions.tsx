"use client";

import { useTransition } from "react";
import { setVendorStatus, assignVendorPlan } from "../actions";
import type { VendorStatus, VendorPlan } from "@/lib/database.types";

export function VendorActions({
  vendorId, status, planId, plans,
}: { vendorId: string; status: VendorStatus; planId: string | null; plans: VendorPlan[] }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="field max-w-[180px] py-2 text-xs" defaultValue={planId ?? ""}
        disabled={pending}
        onChange={(e) => start(() => assignVendorPlan(vendorId, e.target.value).then(() => {}))}>
        <option value="" disabled>Assign plan…</option>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {status !== "verified" && (
        <button className="btn-primary px-3 py-2 text-xs" disabled={pending}
          onClick={() => start(() => setVendorStatus(vendorId, "verified").then(() => {}))}>
          Verify
        </button>
      )}
      {status !== "suspended" && (
        <button className="btn-ghost px-3 py-2 text-xs" disabled={pending}
          onClick={() => start(() => setVendorStatus(vendorId, "suspended").then(() => {}))}>
          Suspend
        </button>
      )}
    </div>
  );
}
