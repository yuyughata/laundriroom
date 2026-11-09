"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setVendorStatus, deleteVendor } from "../actions";
import { sendVendorPasswordReset } from "../users/actions";
import type { VendorStatus } from "@/lib/database.types";

/**
 * Admin actions on a vendor: verify / suspend, email its managers a
 * password-reset link, and delete (only a vendor with no orders — the
 * database refuses otherwise, so money history is never lost).
 */
export function VendorActions({
  vendorId, vendorName, status, canManage = true, afterDelete,
}: { vendorId: string; vendorName: string; status: VendorStatus; canManage?: boolean; afterDelete?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  function run(fn: () => Promise<{ error?: string; ok?: boolean; message?: string } | void>, onOk?: () => void) {
    setErr(null); setNote(null);
    start(async () => {
      const r = await fn();
      if (r && r.error) setErr(r.error);
      else { if (r && r.message) setNote(r.message); onOk?.(); }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "verified" && (
          <button className="btn-primary px-3 py-2 text-xs" disabled={pending}
            onClick={() => run(() => setVendorStatus(vendorId, "verified"))}>
            Verify
          </button>
        )}
        {status !== "suspended" && (
          <button className="btn-ghost px-3 py-2 text-xs" disabled={pending}
            onClick={() => run(() => setVendorStatus(vendorId, "suspended"))}>
            Suspend
          </button>
        )}
        {canManage && (
          <button className="btn-ghost px-3 py-2 text-xs" disabled={pending}
            title="Email the vendor's managers a link to set a new password"
            onClick={() => { if (confirm(`Send a password reset email to ${vendorName}'s managers?`)) run(() => sendVendorPasswordReset(vendorId)); }}>
            Reset password
          </button>
        )}
        {canManage && (
          <button className="btn-ghost border-danger/30 px-3 py-2 text-xs text-danger" disabled={pending}
            onClick={() => {
              if (!confirm(`Delete ${vendorName}? Its branches, prices, tags, riders and team links are removed and can't be restored. Staff accounts stay as customers.`)) return;
              run(() => deleteVendor(vendorId), () => { if (afterDelete) router.push(afterDelete); else router.refresh(); });
            }}>
            Delete
          </button>
        )}
      </div>
      {err && <p className="max-w-xs text-xs text-danger">{err}</p>}
      {note && <p className="max-w-xs text-xs text-teal">{note}</p>}
    </div>
  );
}
