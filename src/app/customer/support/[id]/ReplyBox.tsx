"use client";

import { useState, useTransition } from "react";
import { addCustomerMessage } from "../actions";
import { PhotoAttach, uploadSupportPhotos } from "@/components/support/PhotoAttach";

export function ReplyBox({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <textarea className="field" rows={3} placeholder="Add a reply…" value={body}
        onChange={(e) => setBody(e.target.value)} />
      <PhotoAttach files={photos} onChange={setPhotos} />
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
      <button className="btn-primary mt-2 w-full" disabled={pending || (!body.trim() && !photos.length)}
        onClick={() => start(async () => {
          setErr(null);
          const up = await uploadSupportPhotos(photos);
          if ("error" in up) { setErr(up.error); return; }
          const r = await addCustomerMessage(ticketId, body, up.paths);
          if ("error" in r) setErr(r.error ?? "Couldn’t send."); else { setBody(""); setPhotos([]); }
        })}>
        {pending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
