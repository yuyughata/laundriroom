"use client";

import { useTransition } from "react";
import { releasePayout, holdPayout } from "../actions";

export function PayoutActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  if (status === "sent") return <span className="chip-ok">Sent</span>;

  return (
    <div className="flex gap-2">
      {status !== "held" && (
        <button className="btn-ghost px-3 py-1.5 text-xs" disabled={pending}
          onClick={() => start(() => holdPayout(id).then(() => {}))}>Hold</button>
      )}
      <button className="btn-primary px-3 py-1.5 text-xs" disabled={pending}
        onClick={() => start(() => releasePayout(id).then(() => {}))}>Release</button>
    </div>
  );
}
