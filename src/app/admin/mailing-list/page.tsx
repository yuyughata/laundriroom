import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateShort } from "@/lib/format";
import { whatsappHref } from "@/lib/phone";
import { MailingListTools } from "./MailingListTools";

type Row = { id: string; email: string; phone: string | null; source: string; created_at: string };

export default async function AdminMailingList() {
  const profile = await requireProfile();

  if (profile.role !== "platform_admin") {
    return (
      <AdminShell active="/admin/mailing-list" name={profile.full_name} role={profile.role}>
        <h1 className="font-display text-2xl text-ink">Mailing list</h1>
        <div className="card mt-6 p-5 text-sm text-slate">
          The mailing list is available to platform admins only.
        </div>
      </AdminShell>
    );
  }

  const supabase = createClient();

  let rows: Row[] = [];
  let missing = false;
  try {
    const { data, error } = await supabase
      .from("mailing_list" as never)
      .select("id, email, phone, source, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) missing = true;
    else rows = (data ?? []) as Row[];
  } catch {
    missing = true;
  }

  const emails = rows.map((r) => r.email);
  const withPhone = rows.filter((r) => r.phone).length;

  return (
    <AdminShell active="/admin/mailing-list" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Mailing list</h1>
          <p className="mt-1 text-sm text-slate">
            People who signed up from the homepage “discount promos &amp; great deals” form. Reach out directly, or
            export the list for a campaign.
          </p>
        </div>
        <MailingListTools emails={emails} rows={rows.map(({ email, phone, created_at }) => ({ email, phone, created_at }))} />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {[
          ["Subscribers", rows.length, "total sign-ups"],
          ["With phone", withPhone, "reachable on WhatsApp"],
          ["This month", rows.filter((r) => r.created_at >= new Date(Date.now() - 30 * 864e5).toISOString()).length, "new in the last 30 days"],
        ].map(([label, n, sub]) => (
          <div key={String(label)} className="card p-5">
            <p className="text-xs text-slate">{label}</p>
            <p className="mt-1 font-display text-3xl text-ink">{n}</p>
            <p className="text-xs text-slate">{sub}</p>
          </div>
        ))}
      </div>

      {missing ? (
        <div className="card mt-6 p-5 text-sm text-warn">
          The mailing-list table isn’t available yet. Apply migration{" "}
          <code className="text-ink">0063_mailing_list.sql</code> to the database, then sign-ups will appear here.
        </div>
      ) : rows.length === 0 ? (
        <div className="card mt-6 p-6 text-center text-sm text-slate">
          No sign-ups yet. Once visitors subscribe from the homepage, they’ll show up here.
        </div>
      ) : (
        <div className="card mt-6 overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-slate">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Signed up</th>
                  <th className="px-4 py-3 text-right">Reach out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{r.email}</td>
                    <td className="px-4 py-3 text-slate">{r.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate">{dateShort(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <a className="btn-ghost px-3 py-1 text-xs" href={`mailto:${r.email}`}>Email</a>
                        {r.phone && (
                          <a className="btn-ghost px-3 py-1 text-xs" href={whatsappHref(r.phone)} target="_blank" rel="noopener noreferrer">
                            WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
