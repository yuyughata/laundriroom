"use client";

import { useState, useTransition } from "react";
import { saveIntegration } from "../actions";
import { dateTime } from "@/lib/format";
import type { IntegrationSetting, IntegrationProvider } from "@/lib/database.types";

const META: Record<IntegrationProvider, { title: string; blurb: string; fields: { key: string; label: string; placeholder: string }[] }> = {
  resend: {
    title: "Resend (email)",
    blurb: "Transactional email for order updates and verification.",
    fields: [{ key: "from", label: "From address", placeholder: "laundriroom <notifications@yourdomain.com>" }],
  },
  whatsapp: {
    title: "WhatsApp",
    blurb: "WhatsApp Cloud API for customer, vendor and support alerts. The access token is the WHATSAPP_API_TOKEN edge-function secret.",
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
          Key stored ••••••••{setting.secret_ref ? "" : ""} · last tested {dateTime(setting.last_test_at)}
          {setting.last_test_ok === false && <span className="text-danger"> · last test failed</span>}
        </p>
      )}

      {!open ? (
        <button className="btn-ghost mt-4 text-xs" onClick={() => setOpen(true)}>
          {connected ? "Replace key" : "Connect"}
        </button>
      ) : (
        <form className="mt-4 space-y-3" action={(fd) => start(async () => {
          setErr(null);
          const r = await saveIntegration(fd);
          if (r?.error) setErr(r.error); else setOpen(false);
        })}>
          <input type="hidden" name="provider" value={setting.provider} />
          <div>
            <label className="label">API key</label>
            <input className="field" name="api_key" type="password" placeholder="Paste the provider key" autoComplete="off" />
            <p className="mt-1 text-xs text-slate">
              Stored encrypted on the server and shown masked. Never exposed to the browser.
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
