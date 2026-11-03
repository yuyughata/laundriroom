"use client";

import { useState, useTransition } from "react";
import { releasePayout, holdPayout } from "../actions";

/**
 * Hold or release a payout. Release sends the money now through Paystack
 * (a due or held payout); the row moves to processing, then sent once
 * Paystack confirms.
 */
export function PayoutActions({
  id, status, amount, vendor,
}: { id: string; status: string; amount: string; vendor: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (status === "sent") return <span className="chip-ok">Sent</span>;
  if (status === "processing") return <span className="text-xs text-slate">With Paystack…</span>;

  return (
    <div>
      <div className="flex gap-2">
        {status !== "held" && (
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={pending}
            onClick={() => start(async () => {
              setMsg(null);
              const r = await holdPayout(id);
              if (r?.error) setMsg({ ok: false, text: r.error });
            })}>Hold</button>
        )}
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={pending}
          onClick={() => {
            if (!window.confirm(`Send ${amount} to ${vendor} now through Paystack?`)) return;
            start(async () => {
              setMsg(null);
              const r = await releasePayout(id);
              setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.message ?? "Sent." });
            });
          }}>
          {pending ? "Sending…" : "Release"}
        </button>
      </div>
      {msg && <p className={`mt-1 max-w-[16rem] text-xs ${msg.ok ? "text-teal" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
