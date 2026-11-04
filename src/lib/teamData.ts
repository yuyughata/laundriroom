// Server-side only.
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type TeamMember = {
  membershipId: string;
  profileId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "vendor_manager" | "attendant" | "rider" | string;
  branchId: string | null;
  /** invited = hasn't signed in yet; suspended = blocked by laundriroom. */
  status: "active" | "invited" | "suspended";
  lastSignIn: string | null;
  isYou: boolean;
};

/**
 * A vendor's team with contact details and sign-in status. Staff can't read
 * colleagues' profiles under RLS, so this uses the service key — call it only
 * after checking the caller manages the vendor (or is a laundriroom admin).
 */
export async function loadTeam(vendorId: string, currentProfileId?: string): Promise<TeamMember[]> {
  const service = createServiceClient();
  const db = service ?? createClient();
  const { data } = await db.from("vendor_memberships")
    .select("id, role, branch_id, profile_id, profiles(full_name, email, phone, status)")
    .eq("vendor_id", vendorId);
  type Row = {
    id: string; role: string; branch_id: string | null; profile_id: string;
    profiles: { full_name: string | null; email: string | null; phone: string | null; status: string } | null;
  };
  const rows = (data ?? []) as Row[];

  // Has each person signed in yet? (auth.users, service key only.)
  const signIns = new Map<string, string | null>();
  if (service) {
    await Promise.all(rows.map(async (r) => {
      const { data: u } = await service.auth.admin.getUserById(r.profile_id);
      signIns.set(r.profile_id, u?.user?.last_sign_in_at ?? null);
    }));
  }

  const order: Record<string, number> = { vendor_manager: 0, attendant: 1, rider: 2 };
  return rows.map((r) => {
    const last = signIns.get(r.profile_id) ?? null;
    const status: TeamMember["status"] = r.profiles?.status === "suspended" ? "suspended"
      : service && !last ? "invited" : "active";
    return {
      membershipId: r.id, profileId: r.profile_id,
      name: r.profiles?.full_name || r.profiles?.email || "Staff member",
      email: r.profiles?.email ?? null, phone: r.profiles?.phone ?? null,
      role: r.role, branchId: r.branch_id, status, lastSignIn: last,
      isYou: r.profile_id === currentProfileId,
    };
  }).sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name));
}
