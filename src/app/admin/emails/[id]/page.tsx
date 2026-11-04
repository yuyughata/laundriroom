import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewsletterEditor } from "@/components/newsletter/NewsletterEditor";
import { SentPreview } from "./SentPreview";
import { NewsletterRowActions } from "../RowActions";
import { peopleByIds } from "../actions";
import { audienceSummary } from "../audience";
import { dateTime } from "@/lib/format";
import { EMAIL_KIND_LABEL } from "@/lib/emailKinds";
import type { Newsletter, NewsletterRecipient } from "@/lib/database.types";

export default async function NewsletterPage({ params }: { params: { id: string } }) {
  const profile = await requireProfile();
  if (profile.role !== "platform_admin") redirect("/admin/emails");
  const supabase = createClient();
  const { data } = await supabase.from("newsletters").select("*").eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const n = data as Newsletter;

  if (n.status === "draft") {
    const people = await peopleByIds(n.audience?.user_ids ?? []);
    return (
      <AdminShell active="/admin/emails" name={profile.full_name} role={profile.role}>
        <Link href="/admin/emails" className="text-sm text-slate">← Emails</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-ink">Edit email</h1>
          <span className="chip-muted">Draft</span>
          {n.last_test_at && <span className="text-xs text-slate">Last test {dateTime(n.last_test_at)}</span>}
        </div>
        <div className="mt-5">
          <NewsletterEditor people={people} start={{
            id: n.id, kind: n.kind ?? "newsletter", subject: n.subject, preheader: n.preheader ?? "", body_html: n.body_html, cta_label: n.cta_label ?? "",
            cta_url: n.cta_url ?? "", header_image_url: n.header_image_url, footer_image_url: n.footer_image_url,
            audience: n.audience ?? { groups: [], user_ids: [] }, last_test_at: n.last_test_at,
          }} />
        </div>
      </AdminShell>
    );
  }

  const { data: rec } = await supabase.from("newsletter_recipients").select("*").eq("newsletter_id", n.id)
    .order("status").order("email").limit(500);
  const recipients = (rec ?? []) as NewsletterRecipient[];
  return (
    <AdminShell active="/admin/emails" name={profile.full_name} role={profile.role}>
      <Link href="/admin/emails" className="text-sm text-slate">← Emails</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-ink">{n.subject}</h1>
          <span className="chip-ink">{EMAIL_KIND_LABEL[n.kind ?? "newsletter"]}</span>
          <span className={n.status === "sent" ? "chip-ok" : n.status === "sending" ? "chip-ink" : "chip-warn"}>
            {n.status === "sent" ? "Sent" : n.status === "sending" ? "Sending…" : "Failed"}
          </span>
        </div>
        <NewsletterRowActions id={n.id} draft={false} />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Audience" value={audienceSummary(n)} />
        <Stat label="Recipients" value={String(n.recipient_count)} />
        <Stat label="Delivered to Resend" value={String(n.sent_count)} />
        <Stat label="Failed" value={String(n.failed_count)} />
      </div>
      {n.sent_at && <p className="mt-2 text-xs text-slate">Sent {dateTime(n.sent_at)}</p>}
      {n.last_error && <p className="mt-2 text-sm text-danger">Last error: {n.last_error}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,620px)]">
        <div className="table-scroll rounded-card border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs text-slate">
              <tr><th className="px-4 py-2">Email</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">When</th></tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {recipients.map((r) => (
                <tr key={r.email}>
                  <td className="px-4 py-2 text-ink">{r.email}</td>
                  <td className="px-4 py-2">
                    <span className={r.status === "sent" ? "chip-ok" : r.status === "failed" ? "chip-warn" : "chip-muted"}>{r.status}</span>
                    {r.error && <p className="mt-1 max-w-xs text-xs text-danger">{r.error}</p>}
                  </td>
                  <td className="px-4 py-2 text-slate">{r.sent_at ? dateTime(r.sent_at) : "—"}</td>
                </tr>
              ))}
              {recipients.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-slate">No recipients recorded.</td></tr>}
            </tbody>
          </table>
        </div>
        <SentPreview n={n} />
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate">{label}</p>
      <p className="mt-1 font-display text-xl text-ink">{value}</p>
    </div>
  );
}
