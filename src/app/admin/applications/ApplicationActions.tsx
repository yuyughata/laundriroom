"use client";

import { useState, useTransition } from "react";
import { approveApplication, rejectApplication } from "./actions";

export function ApplicationActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string; message?: string } | void>) {
    setErr(null);
    setNote(null);
    start(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) setErr(r.error);
      else if (r && "message" in r && r.message) setNote(r.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-2 text-xs" disabled={pending}
          onClick={() => run(() => approveApplication(id))}>
          Approve &amp; create vendor
        </button>
        <button className="btn-ghost px-3 py-2 text-xs" disabled={pending}
          onClick={() => run(() => rejectApplication(id))}>
          Reject
        </button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      {note && <p className="max-w-xs text-right text-xs text-slate">{note}</p>}
    </div>
  );
}
