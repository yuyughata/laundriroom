"use client";

import { useState, useTransition } from "react";
import { saveIntegration, disconnectIntegration } from "../actions";
import { dateTime } from "@/lib/format";
import type { IntegrationSetting, IntegrationProvider } from "@/lib/database.types";
import { PasswordInput } from "@/components/ui/PasswordInput";

const META: Record<IntegrationProvider, { title: string; blurb: string; fields: { key: string; label: string; placeholder: string }[] }> = {
  resend: {
    title: "Resend (email)",
    blurb: "Order, account and support emails, and Admin → Emails broadcasts. Key from resend.com → API Keys (starts with re_).",
    fields: [{ key: "from", label: "From address", placeholder: "laundriroom <notifications@yourdomain.com>" }],
  },
  whatsapp: {
    title: "WhatsApp",
    blurb: "WhatsApp Cloud API (Meta) for customer, vendor and support alerts. The key is a permanent System User access token.",
    fields: [
      { key: "phone_id", label: "Phone number ID", placeholder: "1234567890" },
      { key: "template", label: "Approved template name (one body variable {{1}})", placeholder: "laundriroom_alert" },
      { key: "template_lang", label: "Template language code", placeholder: "en" },
    ],
  },
  sms: {
    title: "SMS",
    blurb: "A provider with Nigerian routes. SMS turns on platform-wide once connected.",
    fields: [{ key: "sender_id", label: "Sender ID", placeholder: "LAUNDRIROOM" }],
  },
};

export function IntegrationCard({ setting }: { setting: IntegrationSetting }) {
  const meta = META[setting.provider];
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const connected = setting.status === "connected";

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg text-ink">{meta.title}</p>
          <p className="mt-0.5 text-xs text-slate">{meta.blurb}</p>
        </div>
        <span className={connected ? "chip-ok" : "chip-warn"}>
          {connected ? "Connected" : "Not set up"}
        </span>
      </div>

      {connected && (
        <p className="mt-3 text-xs text-slate">
          Key stored •••••••• · last tested {dateTime(setting.last_test_at)}
          {setting.last_test_ok === false && <span className="text-danger"> · last test failed</span>}
        </p>
      )}
      {connected && !open && setting.last_test_ok === false && setting.last_error && (
        <p className="mt-2 rounded-card bg-danger/10 px-3 py-2 text-xs text-danger">{setting.last_error}</p>
      )}
      {msg && <p className="mt-2 rounded-card bg-teal/10 px-3 py-2 text-xs text-ink">{msg}</p>}

      {!open ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-ghost text-xs" onClick={() => { setOpen(true); setMsg(null); }}>
            {connected ? "Edit / test again" : "Connect"}
          </button>
          {connected && (
            <button className="btn-ghost text-xs text-danger" disabled={pending} onClick={() => {
              if (!window.confirm(`Disconnect ${meta.title}? Its key is deleted and these messages stop.`)) return;
              start(async () => { const r = await disconnectIntegration(setting.provider); if (r?.error) setErr(r.error); });
            }}>Disconnect</button>
          )}
        </div>
      ) : (
        <form className="mt-4 space-y-3" action={(fd) => start(async () => {
          setErr(null); setMsg(null);
          const r = await saveIntegration(fd);
          if (r?.error) setErr(r.error); else { setOpen(false); setMsg(("message" in r && r.message) || "Saved."); }
        })}>
          <input type="hidden" name="provider" value={setting.provider} />
          <div>
            <label className="label">{setting.provider === "whatsapp" ? "Access token" : "API key"}</label>
            <PasswordInput className="field" name="api_key" autoComplete="off"
              placeholder={connected ? "Leave empty to keep the stored key" : "Paste the provider key"} />
            <p className="mt-1 text-xs text-slate">
              Kept encrypted in Supabase Vault; only the server reads it. Never shown again.
            </p>
          </div>
          {meta.fields.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <input className="field" name={`config.${f.key}`}
                defaultValue={(setting.config as Record<string, string>)[f.key] ?? ""} placeholder={f.placeholder} />
            </div>
          ))}
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-xs" disabled={pending}>Save & send test</button>
            <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
