import Link from "next/link";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { NewsletterRowActions, NewNewsletterButton } from "./RowActions";
import { audienceSummary } from "./audience";
import type { Newsletter } from "@/lib/database.types";

export default async function AdminNewsletters() {
  const profile = await requireProfile();
  const isAdmin = profile.role === "platform_admin";
  const supabase = createClient();
  const { data } = isAdmin
    ? await supabase.from("newsletters").select("*").order("created_at", { ascending: false }).limit(200)
    : { data: [] };
  const list = (data ?? []) as Newsletter[];

  return (
    <AdminShell active="/admin/newsletters" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Newsletters</h1>
        {isAdmin && <NewNewsletterButton />}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate">
        Email news and offers to customers, laundry partners or chosen people: a header image, your message, a button and a
        footer image. Everyone can unsubscribe from the link in each email, and they&apos;re left out of future sends.
      </p>

      {!isAdmin ? (
        <p className="mt-6 rounded-card bg-ink/5 px-4 py-3 text-sm text-slate">Only platform admins can write and send newsletters.</p>
      ) : (
        <div className="mt-6 table-scroll rounded-card border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs text-slate">
              <tr>
                <th className="px-4 py-3">Subject</th><th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Audience</th><th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Date</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {list.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link href={`/admin/newsletters/${n.id}`} className="underline decoration-ink/20 hover:decoration-ink">{n.subject || "(no subject)"}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={n.status === "sent" ? "chip-ok" : n.status === "sending" ? "chip-ink" : n.status === "failed" ? "chip-warn" : "chip-muted"}>
                      {n.status === "draft" ? "Draft" : n.status === "sending" ? "Sending" : n.status === "sent" ? "Sent" : "Failed"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate">{audienceSummary(n)}</td>
                  <td className="px-4 py-3 text-slate">
                    {n.status === "draft" ? "—" : `${n.sent_count} of ${n.recipient_count}${n.failed_count ? ` · ${n.failed_count} failed` : ""}`}
                  </td>
                  <td className="px-4 py-3 text-slate">{dateTime(n.sent_at ?? n.updated_at)}</td>
                  <td className="px-4 py-3 text-right"><NewsletterRowActions id={n.id} draft={n.status === "draft"} /></td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate">No newsletters yet. Start one with “New newsletter”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
