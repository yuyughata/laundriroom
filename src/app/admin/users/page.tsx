import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserRowActions } from "./UserRowActions";
import { dateShort } from "@/lib/format";
import type { UserDirectoryRow, Vendor, UserRole } from "@/lib/database.types";

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "customer", label: "Customers" },
  { key: "staff", label: "Staff" },
  { key: "admin", label: "Admins" },
];
const STAFF: UserRole[] = ["attendant", "vendor_manager", "rider"];
const ADMIN: UserRole[] = ["platform_admin", "support_agent"];
const ROLE_LABEL: Record<string, string> = {
  customer: "Customer", attendant: "Attendant", vendor_manager: "Vendor manager",
  rider: "Rider", support_agent: "Support agent", platform_admin: "Platform admin",
};

export default async function AdminUsers({ searchParams }: { searchParams: { role?: string; q?: string } }) {
  const profile = await requireProfile();
  const supabase = createClient();
  const roleFilter = searchParams.role ?? "all";
  const q = searchParams.q?.trim() ?? "";

  let query = supabase.from("user_directory").select("*").order("created_at", { ascending: false }).limit(300);
  if (roleFilter === "staff") query = query.in("role", STAFF);
  else if (roleFilter === "admin") query = query.in("role", ADMIN);
  else if (roleFilter !== "all") query = query.eq("role", roleFilter as UserRole);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);

  const [{ data: users }, { data: vendors }] = await Promise.all([
    query,
    supabase.from("vendors").select("id, name").order("name"),
  ]);

  const rows = (users ?? []) as UserDirectoryRow[];
  const vs = (vendors ?? []) as Pick<Vendor, "id" | "name">[];

  return (
    <AdminShell active="/admin/users" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Users</h1>
      <p className="mt-1 text-sm text-slate">
        Manage every account — change a role or vendor, suspend or delete, and message by email or WhatsApp.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={f.key === "all" ? "/admin/users" : `/admin/users?role=${f.key}`}
              className={`rounded-pill px-3 py-1.5 text-xs ${
                roleFilter === f.key ? "bg-ink text-ivory" : "bg-white text-ink border border-ink/15 hover:bg-ink/5"}`}>
              {f.label}
            </Link>
          ))}
        </div>
        <form className="ml-auto flex gap-2" action="/admin/users">
          {roleFilter !== "all" && <input type="hidden" name="role" value={roleFilter} />}
          <input name="q" defaultValue={q} placeholder="Search name or email"
            className="field max-w-[220px] py-1.5 text-xs" />
          <button className="btn-ghost px-3 py-1.5 text-xs">Search</button>
        </form>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{u.full_name || "—"}</p>
                  {!u.email_verified && u.role === "customer" && <span className="text-xs text-warn">unverified</span>}
                </td>
                <td className="px-4 py-3 text-slate">
                  <p>{u.email || "—"}</p>
                  <p className="text-xs">{u.phone || ""}</p>
                </td>
                <td className="px-4 py-3 text-slate">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-4 py-3 text-slate">{u.vendor_name ?? (STAFF.includes(u.role) ? "—" : "")}</td>
                <td className="px-4 py-3 text-slate">{dateShort(u.created_at)}</td>
                <td className="px-4 py-3"><UserRowActions user={u} vendors={vs} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate">No users match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
