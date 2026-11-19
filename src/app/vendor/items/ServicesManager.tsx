"use client";

import { useState, useTransition } from "react";
import { saveVendorService } from "../actions";
import { SERVICE_LABEL } from "@/lib/format";
import type { ServiceConfig } from "@/lib/vendorServices";

export function ServicesManager({ vendorId, config }: { vendorId: string; config: ServiceConfig[] }) {
  return (
    <div>
      <h2 className="font-display text-lg text-ink">Services</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate">
        Choose which services you offer and rename how they read to customers (e.g. &ldquo;Wash &amp; Iron&rdquo;
        instead of &ldquo;Wash &amp; fold&rdquo;). Turning one off hides it from your public price list and from
        check-in. Prices are set per item under <span className="text-ink">Items manager</span>.
      </p>
      <div className="mt-4 space-y-3">
        {config.map((c) => <ServiceRow key={c.service} vendorId={vendorId} config={c} />)}
      </div>
    </div>
  );
}

function ServiceRow({ vendorId, config }: { vendorId: string; config: ServiceConfig }) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [label, setLabel] = useState(config.label);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const def = SERVICE_LABEL[config.service];
  const dirty = enabled !== config.enabled || label.trim() !== config.label;

  function save() {
    setErr(null); setSaved(false);
    start(async () => {
      const r = await saveVendorService(vendorId, config.service, enabled, label.trim());
      if (r && "error" in r && r.error) setErr(r.error); else setSaved(true);
    });
  }

  return (
    <div className={`card p-4 ${enabled ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className="label">Label shown to customers</label>
          <input className="field" value={label} disabled={pending || !enabled}
            onChange={(e) => setLabel(e.target.value)} placeholder={def} maxLength={40} />
          <p className="mt-1 text-[11px] text-slate">Default: {def}. Leave blank to use it.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-ink" checked={enabled}
            disabled={pending} onChange={(e) => setEnabled(e.target.checked)} />
          Offered
        </label>
        <button className="btn-primary px-3 py-2 text-xs" disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      {saved && !err && <p className="mt-2 text-xs text-teal">Saved.</p>}
    </div>
  );
}
