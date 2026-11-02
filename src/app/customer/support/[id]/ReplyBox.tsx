"use client";

import { useState, useTransition } from "react";
import { addCustomerMessage } from "../actions";

export function ReplyBox({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <textarea className="field" rows={3} placeholder="Add a reply…" value={body}
        onChange={(e) => setBody(e.target.value)} />
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
      <button className="btn-primary mt-2 w-full" disabled={pending || !body.trim()}
        onClick={() => start(async () => {
          setErr(null);
          const r = await addCustomerMessage(ticketId, body);
          if (r?.error) setErr(r.error); else setBody("");
        })}>
        Send
      </button>
    </div>
  );
}
