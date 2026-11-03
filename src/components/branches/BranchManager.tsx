"use client";

import { useState, useTransition } from "react";
import { createBranch, updateBranch, setBranchActive, setBranchOpen, setStaffBranch } from "@/lib/branchActions";
import type { Branch } from "@/lib/database.types";

export type StaffRow = { id: string; name: string; role: string; branch_id: string | null; isYou?: boolean };

const ROLE: Record<string, string> = { vendor_manager: "Manager", attendant: "Attendant", rider: "Rider" };
const hhmm = (t: string | null | undefined, d: string) => (t ? t.slice(0, 5) : d);

/**
 * Add and edit a vendor's branches and put staff at a branch. Used by the
 * vendor's business-wide manager (Vendor → Branches) and by admins on the
 * vendor's behalf (Admin → Vendors → a vendor). Read-only for everyone else.
 */
export function BranchManager({
  vendorId, branches, staff, canManage, mapsOn,
}: {
  vendorId: string; branches: Branch[]; staff?: StaffRow[]; canManage: boolean; mapsOn: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const active = branches.filter((b) => b.active);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {branches.map((b) => (
          <BranchCard key={b.id} vendorId={vendorId} branch={b} canManage={canManage} mapsOn={mapsOn}
            staffCount={staff?.filter((s) => s.branch_id === b.id).length} />
        ))}
      </div>

      {canManage && (adding ? (
        <div className="card p-5">
          <p className="font-display text-lg text-ink">New branch</p>
          <p className="mt-1 text-xs text-slate">
            It starts taking orders straight away, with the business&apos;s price list, and shows on your public page.
          </p>
          <BranchForm submitLabel="Add branch" mapsOn={mapsOn}
            onSubmit={(fd) => createBranch(vendorId, fd)} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>Add a branch</button>
      ))}

      {staff && staff.length > 0 && (
        <div className="card p-5">
          <p className="font-display text-lg text-ink">Staff</p>
          <p className="mt-1 text-xs text-slate">
            Staff at a branch only see that branch&apos;s orders. <strong className="text-ink">All branches</strong> gives
            access to every branch; a manager on all branches can also manage branches, prices, promos and payouts.
          </p>
          <div className="table-scroll mt-3 rounded-card border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-ink/5 text-left text-xs text-slate">
                <tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Works at</th></tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {staff.map((s) => (
                  <StaffRowView key={s.id} vendorId={vendorId} row={s} branches={active} canManage={canManage} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function BranchCard({ vendorId, branch: b, canManage, mapsOn, staffCount }: {
  vendorId: string; branch: Branch; canManage: boolean; mapsOn: boolean; staffCount?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string } | { ok: true }>) =>
    start(async () => { setErr(null); const r = await fn(); if ("error" in r && r.error) setErr(r.error); });

  return (
    <div className={`card p-5 ${b.active ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg text-ink">{b.name}</p>
          <p className="text-xs text-slate">
            {[b.address_line, b.area, b.city].filter(Boolean).join(", ") || "No address yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {b.is_main && <span className="chip-ink">Main</span>}
          {!b.active ? <span className="chip-muted">Not taking orders</span>
            : <span className={b.is_open ? "chip-ok" : "chip-warn"}>{b.is_open ? "Open" : "Closed today"}</span>}
        </div>
      </div>

      {editing ? (
        <BranchForm branch={b} submitLabel="Save branch" mapsOn={mapsOn}
          onSubmit={(fd) => updateBranch(vendorId, b.id, fd)} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-slate">Hours</dt><dd className="text-ink">{hhmm(b.opens_at, "07:00")}–{hhmm(b.closes_at, "18:00")}</dd>
          <dt className="text-slate">Phone</dt><dd className="text-ink">{b.phone || "—"}</dd>
          <dt className="text-slate">Delivery radius</dt><dd className="text-ink">{Number(b.service_radius_km)} km</dd>
          {mapsOn && (<><dt className="text-slate">On the map</dt>
            <dd className={b.lat != null ? "text-teal" : "text-warn"}>{b.lat != null ? "Located" : "Not located — check the address"}</dd></>)}
          {typeof staffCount === "number" && (<><dt className="text-slate">Staff here</dt><dd className="text-ink">{staffCount}</dd></>)}
        </dl>
      )}

      {canManage && !editing && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/5 pt-3">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>Edit</button>
          {b.active && (
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={pending}
              onClick={() => run(() => setBranchOpen(vendorId, b.id, !b.is_open))}>
              {b.is_open ? "Close for today" : "Reopen"}
            </button>
          )}
          {!b.is_main && (
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={pending}
              onClick={() => {
                if (b.active && !window.confirm(`Stop taking orders at ${b.name}? It disappears from your public page; existing orders carry on.`)) return;
                run(() => setBranchActive(vendorId, b.id, !b.active));
              }}>
              {b.active ? "Stop taking orders" : "Start taking orders"}
            </button>
          )}
        </div>
      )}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}

function BranchForm({ branch, submitLabel, onSubmit, onDone, onCancel, mapsOn }: {
  branch?: Branch; submitLabel: string; mapsOn: boolean;
  onSubmit: (fd: FormData) => Promise<{ error: string } | { ok: true }>;
  onDone: () => void; onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const id = branch?.id ?? "new";

  return (
    <form className="mt-3 space-y-3" action={(fd) => start(async () => {
      setErr(null);
      const r = await onSubmit(fd);
      if ("error" in r) setErr(r.error); else onDone();
    })}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`n-${id}`}>Branch name</label>
          <input id={`n-${id}`} name="name" className="field" required maxLength={80}
            defaultValue={branch?.name} placeholder="e.g. Yaba, Lekki Phase 1" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`a-${id}`}>Street address</label>
          <input id={`a-${id}`} name="address_line" className="field" defaultValue={branch?.address_line ?? ""}
            placeholder="12 Herbert Macaulay Way" />
        </div>
        <div>
          <label className="label" htmlFor={`ar-${id}`}>Area</label>
          <input id={`ar-${id}`} name="area" className="field" defaultValue={branch?.area ?? ""} placeholder="Yaba" />
        </div>
        <div>
          <label className="label" htmlFor={`c-${id}`}>City</label>
          <input id={`c-${id}`} name="city" className="field" defaultValue={branch?.city ?? "Lagos"} />
        </div>
        <div>
          <label className="label" htmlFor={`o-${id}`}>Opens</label>
          <input id={`o-${id}`} name="opens_at" type="time" className="field" required defaultValue={hhmm(branch?.opens_at, "07:00")} />
        </div>
        <div>
          <label className="label" htmlFor={`cl-${id}`}>Closes</label>
          <input id={`cl-${id}`} name="closes_at" type="time" className="field" required defaultValue={hhmm(branch?.closes_at, "18:00")} />
        </div>
        <div>
          <label className="label" htmlFor={`p-${id}`}>Phone (optional)</label>
          <input id={`p-${id}`} name="phone" type="tel" className="field" defaultValue={branch?.phone ?? ""} placeholder="+234 …" />
        </div>
        <div>
          <label className="label" htmlFor={`r-${id}`}>Delivery radius (km)</label>
          <input id={`r-${id}`} name="service_radius_km" inputMode="decimal" className="field" required
            defaultValue={String(branch?.service_radius_km ?? 5)} />
        </div>
      </div>
      {mapsOn && <p className="text-xs text-slate">The address is placed on Google Maps to price deliveries by distance.</p>}
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function StaffRowView({ vendorId, row, branches, canManage }: {
  vendorId: string; row: StaffRow; branches: Branch[]; canManage: boolean;
}) {
  const [value, setValue] = useState(row.branch_id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const label = row.branch_id ? branches.find((b) => b.id === row.branch_id)?.name ?? "A closed branch" : "All branches";

  return (
    <tr>
      <td className="px-4 py-2.5 text-ink">{row.name}{row.isYou && <span className="text-slate"> (you)</span>}</td>
      <td className="px-4 py-2.5 text-slate">{ROLE[row.role] ?? row.role}</td>
      <td className="px-4 py-2.5">
        {canManage && !row.isYou ? (
          <div className="flex flex-wrap items-center gap-2">
            <select className="field max-w-[14rem] py-2" value={value} disabled={pending}
              aria-label={`Branch for ${row.name}`}
              onChange={(e) => {
                const v = e.target.value;
                setValue(v);
                start(async () => {
                  setMsg(null);
                  const r = await setStaffBranch(vendorId, row.id, v || null);
                  setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: "Saved" });
                  if ("error" in r) setValue(row.branch_id ?? "");
                });
              }}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {msg && <span className={`text-xs ${msg.ok ? "text-teal" : "text-danger"}`}>{msg.text}</span>}
          </div>
        ) : (
          <span className="text-ink">{label}</span>
        )}
      </td>
    </tr>
  );
}
