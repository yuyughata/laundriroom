import { AdminShell } from "@/components/shells/AdminShell";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IntegrationCard } from "./IntegrationCard";
import { PaymentsCard } from "./PaymentsCard";
import type { IntegrationSetting, PlatformSettings } from "@/lib/database.types";

const ORDER = ["resend", "whatsapp", "sms"];

export default async function AdminIntegrations() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data }, { data: platform }] = await Promise.all([
    supabase.from("integration_settings").select("*"),
    supabase.from("platform_settings").select("payment_provider").eq("id", true).maybeSingle(),
  ]);
  const settings = ((data as IntegrationSetting[]) ?? [])
    .sort((a, b) => ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider));
  const provider = (platform as Pick<PlatformSettings, "payment_provider"> | null)?.payment_provider ?? "paystack";

  return (
    <AdminShell active="/admin/integrations" name={profile.full_name} role={profile.role}>
      <h1 className="font-display text-2xl text-ink">Integrations</h1>
      <p className="mt-1 text-sm text-slate">
        Connect, test and replace the API details for email, WhatsApp and SMS — no code release needed.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {settings.map((s) => <IntegrationCard key={s.id} setting={s} />)}
      </div>

      <div className="mt-6 max-w-md">
        <PaymentsCard current={provider} />
      </div>

      <div className="mt-8 rounded-card border border-ink/10 bg-white p-5 text-sm text-slate">
        <p className="font-medium text-ink">How keys are handled</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>API keys are stored encrypted on the server and shown masked; every change is written to the audit log.</li>
          <li>Payment keys (Paystack) live in server secrets, not here, and are not editable from this screen.</li>
          <li>SMS stays off platform-wide until a provider is connected; then it appears in the channel list on Communications.</li>
        </ul>
      </div>
    </AdminShell>
  );
}
