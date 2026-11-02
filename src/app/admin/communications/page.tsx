import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RuleRow } from "./RuleRow";
import type { NotificationRule, IntegrationSetting } from "@/lib/database.types";

export default async function AdminComms() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: rules }, { data: integrations }] = await Promise.all([
    supabase.from("notification_rules").select("*").order("event"),
    supabase.from("integration_settings").select("*"),
  ]);

  const smsReady = ((integrations as IntegrationSetting[] ?? [])
    .find((i) => i.provider === "sms")?.status === "connected");

  return (
    <AdminShell active="/admin/communications" name={profile.full_name} role={profile.role}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Communications</h1>
        <a className="btn-ghost px-3 py-2 text-xs" href="/api/emails/preview" target="_blank" rel="noopener noreferrer">
          Preview email templates
        </a>
      </div>
      <p className="mt-1 text-sm text-slate">
        Who is alerted, on which channel, for each event. Application code only
        announces events — these rules decide the channel and recipients. Emails
        use the Ink &amp; Ivory HTML templates; WhatsApp and SMS use plain text.
      </p>

      <div className="mt-6 overflow-x-auto rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3 text-center">Email</th>
              <th className="px-4 py-3 text-center">WhatsApp</th>
              <th className="px-4 py-3 text-center">
                SMS {!smsReady && <span className="ml-1 text-warn">· not set up</span>}
              </th>
              <th className="px-4 py-3">Recipients</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {(rules as NotificationRule[] ?? []).map((r) => (
              <RuleRow key={r.id} rule={r} smsReady={smsReady} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate">
        SMS is built and ready — it joins the channel list once a provider is added under{" "}
        <span className="font-medium text-ink">Integrations</span>.
      </p>
    </AdminShell>
  );
}
