"use client";

import { useTransition } from "react";
import { setVendorStatus } from "../actions";
import type { VendorStatus } from "@/lib/database.types";

export function VendorActions({
  vendorId, status,
}: { vendorId: string; status: VendorStatus }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
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
