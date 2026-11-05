"use client";

import { useState, useTransition } from "react";
import { replyTicket, setTicketStatus, assignToMe } from "../actions";
import { PhotoAttach, uploadSupportPhotos } from "@/components/support/PhotoAttach";
import type { TicketStatus } from "@/lib/database.types";

const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const LABEL: Record<TicketStatus, string> = {
  open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed",
};

export function TicketControls({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    setErr(null);
    start(async () => { const r = await fn(); if (r?.error) setErr(r.error); });
  }

  return (
    <div className="card p-4">
      <p className="label">Status</p>
      <select className="field" defaultValue={status} disabled={pending}
        onChange={(e) => run(() => setTicketStatus(ticketId, e.target.value as TicketStatus))}>
        {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
      </select>
      <button className="btn-ghost mt-3 w-full text-xs" disabled={pending}
        onClick={() => run(() => assignToMe(ticketId))}>
        Assign to me
      </button>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}

export function SupportReplyBox({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <textarea className="field" rows={3} placeholder="Reply to the customer…" value={body}
        onChange={(e) => setBody(e.target.value)} />
      <PhotoAttach files={photos} onChange={setPhotos} />
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
      <button className="btn-primary mt-2" disabled={pending || (!body.trim() && !photos.length)}
        onClick={() => start(async () => {
          setErr(null);
          const up = await uploadSupportPhotos(photos);
          if ("error" in up) { setErr(up.error); return; }
          const r = await replyTicket(ticketId, body, up.paths);
          if ("error" in r) setErr(r.error ?? "Couldn’t send."); else { setBody(""); setPhotos([]); }
        })}>
        {pending ? "Sending…" : "Send reply"}
      </button>
    </div>
  );
}
