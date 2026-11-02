"use client";

import { useState, useTransition } from "react";
import { resolveClaim } from "../actions";
import type { ClaimStatus } from "@/lib/database.types";

const STATUSES: ClaimStatus[] = ["open", "investigating", "approved", "rejected", "resolved"];

export function ResolveForm({
  id, status, compensation, note,
}: { id: string; status: ClaimStatus; compensation: number; note: string | null }) {
  const [st, setSt] = useState<ClaimStatus>(status);
  const [comp, setComp] = useState(String(compensation || ""));
  const [n, setN] = useState(note ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="card p-4">
      <p className="label">Resolve claim</p>
      <select className="field" value={st} onChange={(e) => setSt(e.target.value as ClaimStatus)}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="label mt-3">Compensation (₦)</label>
      <input className="field" inputMode="numeric" value={comp} onChange={(e) => setComp(e.target.value)} />
      <label className="label mt-3">Resolution note (shown to the customer)</label>
      <textarea className="field" rows={3} value={n} onChange={(e) => setN(e.target.value)} />
      {msg && <p className="mt-2 text-xs text-teal">{msg}</p>}
      <button className="btn-primary mt-3 w-full text-sm" disabled={pending}
        onClick={() => start(async () => {
          setMsg(null);
          const r = await resolveClaim(id, st, Number(comp) || 0, n);
          if (r?.error) setMsg(r.error); else setMsg("Saved.");
        })}>
        Save resolution
      </button>
    </div>
  );
}
