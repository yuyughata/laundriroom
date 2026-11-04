"use client";

import { useState, useTransition } from "react";
import { inviteStaff, updateStaff, removeStaff, sendLoginLink } from "@/lib/teamActions";
import type { TeamMember } from "@/lib/teamData";

type BranchOpt = { id: string; name: string };

const ROLE_LABEL: Record<string, string> = { vendor_manager: "Manager", attendant: "Attendant", rider: "Rider" };
const STATUS: Record<TeamMember["status"], { label: string; chip: string }> = {
  active: { label: "Active", chip: "chip-ok" },
  invited: { label: "Invite sent", chip: "chip-warn" },
  suspended: { label: "Suspended", chip: "chip-muted" },
};

/**
 * Add and manage a vendor's staff: invite by email, set role and branch,
 * send a login link, remove. Used at Vendor → Team (main manager) and
 * Admin → Vendors → a vendor (laundriroom admins, on the vendor's behalf).
 */
export function TeamManager({ vendorId, team, branches, canManage, forAdmin = false }: {
  vendorId: string; team: TeamMember[]; branches: BranchOpt[]; canManage: boolean; forAdmin?: boolean;
}) {
  const multi = branches.length > 1;
  return (
    <div className="space-y-6">
      {canManage && <InviteForm vendorId={vendorId} branches={branches} forAdmin={forAdmin} />}

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-ink">Team ({team.length})</h2>
          <p className="text-xs text-slate">Managers see everything, including money. Attendants see orders, tags, item requests and reviews.</p>
        </div>
        {team.length === 0 ? (
          <p className="mt-3 text-sm text-slate">No staff yet.</p>
        ) : (
          <div className="table-scroll mt-3 rounded-card border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-ink/5 text-left text-xs text-slate">
                <tr>
                  <th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Role</th>
                  {multi && <th className="px-4 py-2.5">Works at</th>}
                  <th className="px-4 py-2.5">Status</th>{canManage && <th className="px-4 py-2.5"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {team.map((m) => <MemberRow key={m.membershipId} vendorId={vendorId} m={m} branches={branches} multi={multi} canManage={canManage} forAdmin={forAdmin} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-card bg-ink/5 p-5 text-sm text-slate">
        <h3 className="font-medium text-ink">How staff sign in</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>{forAdmin ? "You (or the vendor’s manager) add" : "You add"} them here with their email.</li>
          <li>laundriroom emails them a link to set their own password — nobody else ever sees it.</li>
          <li>They sign in at the laundriroom login page with that email and password, on the shop’s tablet or their phone, and land on the vendor dashboard.</li>
        </ol>
        <p className="mt-2">Everyone gets their own login, so the app records who checked in, processed and handed over each order. Lost the email? Use <strong className="text-ink">Send login link</strong>.</p>
      </section>
    </div>
  );
}

function InviteForm({ vendorId, branches, forAdmin }: { vendorId: string; branches: BranchOpt[]; forAdmin: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [role, setRole] = useState("attendant");
  const [branch, setBranch] = useState(branches.length > 1 ? branches[0]?.id ?? "" : "");
  const [formKey, setFormKey] = useState(0);
  return (
    <section className="card p-5">
      <h2 className="font-display text-lg text-ink">Add a staff member</h2>
      <p className="mt-1 text-xs text-slate">
        {forAdmin ? "Adding on the vendor’s behalf. " : ""}They get an email from laundriroom to set their password.
      </p>
      <form key={formKey} className="mt-4 grid gap-3 sm:grid-cols-2"
        action={(fd) => start(async () => {
          setMsg(null);
          const r = await inviteStaff(vendorId, fd);
          if ("error" in r) setMsg({ ok: false, text: r.error });
          else { setMsg({ ok: true, text: r.message ?? "Added." }); setFormKey((k) => k + 1); setRole("attendant"); setBranch(branches.length > 1 ? branches[0]?.id ?? "" : ""); }
        })}>
        <div><label className="label" htmlFor="tm-name">Full name</label><input id="tm-name" name="full_name" className="field" required /></div>
        <div><label className="label" htmlFor="tm-email">Email</label><input id="tm-email" name="email" type="email" className="field" required placeholder="name@example.com" /></div>
        <div><label className="label" htmlFor="tm-phone">Phone <span className="font-normal text-slate">(optional)</span></label><input id="tm-phone" name="phone" className="field" inputMode="tel" /></div>
        <div>
          <label className="label" htmlFor="tm-role">Role</label>
          <select id="tm-role" name="role" className="field" value={role}
            onChange={(e) => { setRole(e.target.value); setBranch(e.target.value === "vendor_manager" || branches.length < 2 ? "" : branches[0]?.id ?? ""); }}>
            <option value="attendant">Attendant — orders, tags, check-in</option>
            <option value="vendor_manager">Manager — everything, including money</option>
          </select>
        </div>
        {branches.length > 1 && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="tm-branch">Works at</label>
            <select id="tm-branch" name="branch_id" className="field" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">All branches{role === "vendor_manager" ? " (main manager)" : ""}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name} only</option>)}
            </select>
          </div>
        )}
        {branches.length < 2 && <input type="hidden" name="branch_id" value="" />}
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={pending}>{pending ? "Sending invite…" : "Send invite"}</button>
          {msg && <p className={`text-sm ${msg.ok ? "text-teal" : "text-danger"}`}>{msg.text}</p>}
        </div>
      </form>
    </section>
  );
}

function MemberRow({ vendorId, m, branches, multi, canManage, forAdmin }: {
  vendorId: string; m: TeamMember; branches: BranchOpt[]; multi: boolean; canManage: boolean; forAdmin: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = !canManage || (m.isYou && !forAdmin);
  const run = (fn: () => Promise<{ ok: true; message?: string } | { error: string }>) => start(async () => {
    setMsg(null);
    const r = await fn();
    if ("error" in r) setMsg({ ok: false, text: r.error });
    else if (r.message) setMsg({ ok: true, text: r.message });
  });
  const st = STATUS[m.status];

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{m.name}{m.isYou && <span className="ml-1 text-xs text-slate">(you)</span>}</p>
        <p className="text-xs text-slate">{[m.email, m.phone].filter(Boolean).join(" · ") || "—"}</p>
        {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-teal" : "text-danger"}`}>{msg.text}</p>}
      </td>
      <td className="px-4 py-3">
        {locked || m.role === "rider" ? <span className="text-ink">{ROLE_LABEL[m.role] ?? m.role}</span> : (
          <select className="field py-1.5 text-sm" aria-label={`Role for ${m.name}`} value={m.role} disabled={pending}
            onChange={(e) => run(() => updateStaff(vendorId, m.membershipId, { role: e.target.value }))}>
            <option value="attendant">Attendant</option>
            <option value="vendor_manager">Manager</option>
          </select>
        )}
      </td>
      {multi && (
        <td className="px-4 py-3">
          {locked ? <span className="text-ink">{m.branchId ? branches.find((b) => b.id === m.branchId)?.name ?? "A branch" : "All branches"}</span> : (
            <select className="field py-1.5 text-sm" aria-label={`Branch for ${m.name}`} value={m.branchId ?? ""} disabled={pending}
              onChange={(e) => run(() => updateStaff(vendorId, m.membershipId, { branchId: e.target.value || null }))}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </td>
      )}
      <td className="px-4 py-3"><span className={st.chip}>{st.label}</span></td>
      {canManage && (
        <td className="px-4 py-3">
          {!m.isYou && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {m.email && (
                <button className="btn-ghost px-2.5 py-1 text-xs" disabled={pending}
                  onClick={() => run(() => sendLoginLink(vendorId, m.membershipId))}>
                  {m.status === "invited" ? "Resend invite" : "Send login link"}
                </button>
              )}
              <button className="btn-ghost px-2.5 py-1 text-xs text-danger" disabled={pending}
                onClick={() => { if (confirm(`Remove ${m.name} from the team? They'll lose access to the vendor dashboard.`)) run(() => removeStaff(vendorId, m.membershipId)); }}>
                Remove
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}
