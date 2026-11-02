"use client";

import { useState, useTransition } from "react";
import { updateUserRole, setUserStatus, attachToVendor, deleteUser, emailUser } from "./actions";
import type { UserDirectoryRow, UserRole } from "@/lib/database.types";

const ROLES: UserRole[] = ["customer", "attendant", "vendor_manager", "rider", "support_agent", "platform_admin"];
const STAFF: UserRole[] = ["attendant", "vendor_manager", "rider"];
const ROLE_LABEL: Record<UserRole, string> = {
  customer: "Customer", attendant: "Attendant", vendor_manager: "Vendor manager",
  rider: "Rider", support_agent: "Support agent", platform_admin: "Platform admin",
};

export function UserRowActions({
  user, vendors,
}: { user: UserDirectoryRow; vendors: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setMsg(r.error);
    });
  }

  const waPhone = (user.phone ?? "").replace(/[^\d]/g, "");
  const waHref = waPhone ? `https://wa.me/${waPhone}` : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {/* role */}
        <select className="field max-w-[150px] py-1.5 text-xs" defaultValue={user.role} disabled={pending}
          onChange={(e) => run(() => updateUserRole(user.id, e.target.value as UserRole))}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>

        {/* vendor attach, for staff only */}
        {STAFF.includes(user.role) && (
          <select className="field max-w-[150px] py-1.5 text-xs" defaultValue={user.vendor_id ?? ""} disabled={pending}
            onChange={(e) => run(() => attachToVendor(user.id, e.target.value))}>
            <option value="">No vendor</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}

        {/* status */}
        <button className={user.status === "active" ? "chip-ok" : "chip-warn"} disabled={pending}
          onClick={() => run(() => setUserStatus(user.id, user.status === "active" ? "suspended" : "active"))}>
          {user.status === "active" ? "Active" : "Suspended"}
        </button>

        {/* message */}
        <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setCompose((v) => !v)}>Message</button>

        {/* delete */}
        <button className="btn-ghost border-danger/30 px-2.5 py-1.5 text-xs text-danger" disabled={pending}
          onClick={() => { if (confirm(`Delete ${user.full_name || "this user"}? This can't be undone.`)) run(() => deleteUser(user.id)); }}>
          Delete
        </button>
      </div>

      {compose && (
        <div className="mt-1 w-full max-w-md rounded-card border border-ink/10 bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-ink">Message {user.full_name || "user"}</p>
            {waHref && (
              <a href={`${waHref}`} target="_blank" rel="noopener noreferrer" className="chip-ok">Open WhatsApp</a>
            )}
          </div>
          <EmailComposer userId={user.id} hasEmail={Boolean(user.email)} onDone={() => setCompose(false)} />
        </div>
      )}

      {msg && <p className="text-xs text-danger">{msg}</p>}
    </div>
  );
}

function EmailComposer({ userId, hasEmail, onDone }: { userId: string; hasEmail: boolean; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState<string | null>(null);

  if (!hasEmail) return <p className="mt-2 text-xs text-slate">No email on file — use WhatsApp.</p>;

  return (
    <div className="mt-2 space-y-2">
      <input className="field py-1.5 text-xs" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="field text-xs" rows={3} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
      {note && <p className="text-xs text-danger">{note}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={pending || !subject || !body}
          onClick={() => start(async () => {
            setNote(null);
            const r = await emailUser(userId, subject, body);
            if (r?.error) setNote(r.error); else { setNote(null); onDone(); }
          })}>
          Send email
        </button>
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onDone}>Close</button>
      </div>
    </div>
  );
}
