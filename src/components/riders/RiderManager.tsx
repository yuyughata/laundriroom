"use client";

import { useMemo, useState, useTransition } from "react";
import { addRider, updateRider, setRiderActive, type RiderInput } from "@/app/vendor/riders/actions";
import { dateShort } from "@/lib/format";
import { telHref, whatsappHref } from "@/lib/phone";
import type { RiderContact } from "@/lib/database.types";

export type RiderRow = RiderContact & { orders: number; branchName: string | null; canManage: boolean };
type Branch = { id: string; name: string };

const empty: RiderInput = { name: "", phone: "", kind: "own", company: "", notes: "", branchId: null };

function RiderForm({ start, branches, canPickBranch, submitLabel, onSubmit, onCancel }: {
  start: RiderInput; branches: Branch[]; canPickBranch: boolean; submitLabel: string;
  onSubmit: (r: RiderInput) => Promise<{ error?: string } | { ok: boolean }>; onCancel?: () => void;
}) {
  const [r, setR] = useState<RiderInput>(start);
  const [err, setErr] = useState<string | null>(null);
  const [pending, go] = useTransition();
  const set = (k: keyof RiderInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setR({ ...r, [k]: e.target.value });
  return (
    <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault(); setErr(null);
      go(async () => { const res = await onSubmit(r); if ("error" in res && res.error) setErr(res.error); else if (!onCancel) setR(empty); });
    }}>
      <input className="field" placeholder="Name" aria-label="Name" value={r.name} onChange={set("name")} />
      <input className="field" placeholder="Phone" aria-label="Phone" inputMode="tel" value={r.phone} onChange={set("phone")} />
      <select className="field" aria-label="Type" value={r.kind} onChange={set("kind")}>
        <option value="own">Our own rider</option>
        <option value="dispatch">Dispatch company</option>
      </select>
      {r.kind === "dispatch"
        ? <input className="field" placeholder="Company (e.g. GIG Logistics)" aria-label="Company" value={r.company ?? ""} onChange={set("company")} />
        : <span className="hidden sm:block" />}
      <input className="field sm:col-span-2" placeholder="Notes (optional) — e.g. bike only, covers Lekki" aria-label="Notes" value={r.notes ?? ""} onChange={set("notes")} />
      {canPickBranch && branches.length > 0 && (
        <select className="field sm:col-span-2" aria-label="Branch" value={r.branchId ?? ""} onChange={set("branchId")}>
          <option value="">Every branch</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name} only</option>)}
        </select>
      )}
      {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary text-sm" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {onCancel && <button type="button" className="btn-ghost text-sm" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export function RiderManager({ rows, branches, canPickBranch }: { rows: RiderRow[]; branches: Branch[]; canPickBranch: boolean }) {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, go] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase(), d = q.replace(/\D/g, "").replace(/^234/, "").replace(/^0/, "");
    return rows.filter((r) => (showArchived || r.active) && (!t || r.name.toLowerCase().includes(t)
      || (r.company ?? "").toLowerCase().includes(t) || (d.length >= 3 && r.phone_key.includes(d))));
  }, [rows, q, showArchived]);
  const archived = rows.filter((r) => !r.active).length;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="field max-w-sm" placeholder="Search name, phone or company" aria-label="Search riders" value={q} onChange={(e) => setQ(e.target.value)} />
        {archived > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived ({archived})
          </label>
        )}
        <button className="btn-primary ml-auto text-sm" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "Add rider"}</button>
      </div>

      {adding && (
        <div className="card p-4">
          <p className="mb-3 font-medium text-ink">New rider</p>
          <RiderForm start={empty} branches={branches} canPickBranch={canPickBranch} submitLabel="Save rider"
            onSubmit={async (r) => { const res = await addRider(r); if (!("error" in res)) setAdding(false); return res; }} />
        </div>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}

      <div className="table-scroll rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">Rider</th><th className="px-4 py-3">Type</th>
              {branches.length > 0 && <th className="px-4 py-3">Branch</th>}
              <th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3">Last used</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {list.map((r) => editing === r.id ? (
              <tr key={r.id}><td colSpan={6} className="px-4 py-3">
                <RiderForm branches={branches} canPickBranch={canPickBranch} submitLabel="Save changes" onCancel={() => setEditing(null)}
                  start={{ name: r.name, phone: r.phone, kind: r.kind, company: r.company ?? "", notes: r.notes ?? "", branchId: r.branch_id }}
                  onSubmit={async (v) => { const res = await updateRider(r.id, v); if (!("error" in res)) setEditing(null); return res; }} />
              </td></tr>
            ) : (
              <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-slate">{r.phone}</p>
                  {r.notes && <p className="text-xs text-slate">{r.notes}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={r.kind === "dispatch" ? "chip-warn" : "chip-muted"}>{r.kind === "dispatch" ? (r.company || "Dispatch") : "Own rider"}</span>
                  {!r.active && <span className="chip-muted ml-1">Archived</span>}
                </td>
                {branches.length > 0 && <td className="px-4 py-3 text-slate">{r.branchName ?? "Every branch"}</td>}
                <td className="px-4 py-3 text-right text-ink">{r.orders}</td>
                <td className="px-4 py-3 text-slate">{r.last_used_at ? dateShort(r.last_used_at) : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2 text-xs">
                    <a className="btn-ghost px-3 py-1" href={telHref(r.phone)}>Call</a>
                    <a className="btn-ghost px-3 py-1" href={whatsappHref(r.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    {r.canManage && (
                      <>
                        <button className="btn-ghost px-3 py-1" onClick={() => setEditing(r.id)}>Edit</button>
                        <button className="btn-ghost px-3 py-1" disabled={pending} onClick={() => go(async () => {
                          setErr(null);
                          const res = await setRiderActive(r.id, !r.active);
                          if ("error" in res && res.error) setErr(res.error);
                        })}>{r.active ? "Archive" : "Restore"}</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate">
                {rows.length ? "No rider matches." : "No riders yet. Add your riders here, or save them straight from an order when you assign one."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
