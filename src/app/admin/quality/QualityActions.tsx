"use client";

import { useState, useTransition } from "react";
import { takeQualityAction, type QualityStage } from "./actions";

export type CaseStep = {
  id: string; stage: QualityStage; message: string; created_at: string;
  vendor_response: string | null; responded_at: string | null;
};

const NEXT_TEXT: Record<string, (v: string, n: number) => string> = {
  inquiry: (v, n) => `Hello ${v}, we've noticed ${n} low rating(s) from customers in the last 30 days. Could you tell us what happened on these orders, and what you're doing to put things right?`,
  warning: (v, n) => `Hello ${v}, low ratings are continuing (${n} in the last 30 days). This is a formal warning: please fix the underlying issues and follow up with each affected customer. If this continues, your laundry may be suspended.`,
  suspension: (v) => `Hello ${v}, after an inquiry and a warning, low customer ratings have continued, so your laundry is suspended from laundriroom. Please contact support to discuss reinstatement.`,
};
const LABEL: Record<string, string> = { inquiry: "Send inquiry", warning: "Send warning", suspension: "Suspend vendor" };

/** The next escalation step (in order), plus "Resolve case". */
export function QualityActions({ vendorId, vendorName, steps, badCount }: {
  vendorId: string; vendorName: string; steps: CaseStep[]; badCount: number;
}) {
  const open: QualityStage[] = [];
  for (const s of steps) { if (s.stage === "resolved") break; open.push(s.stage); }
  const current = open[0];
  const next = (!current ? "inquiry" : current === "inquiry" ? "warning" : current === "warning" ? "suspension" : null) as QualityStage | null;

  const [form, setForm] = useState<QualityStage | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (stage: QualityStage, message: string) => start(async () => {
    setMsg(null);
    const r = await takeQualityAction(vendorId, stage, message);
    if ("error" in r && r.error) setMsg({ ok: false, text: r.error });
    else { setMsg({ ok: true, text: stage === "resolved" ? "Case resolved." : "Sent to the vendor." }); setForm(null); }
  });

  return (
    <div className="mt-4 border-t border-ink/5 pt-3">
      {form ? (
        <div className="space-y-2">
          <label className="label" htmlFor={`m-${vendorId}`}>Message to {vendorName}</label>
          <textarea id={`m-${vendorId}`} className="field min-h-[110px]" value={text} onChange={(e) => setText(e.target.value)} />
          {form === "suspension" && (
            <p className="text-xs text-warn">This suspends the vendor: they disappear from ordering and can&apos;t take new orders.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={form === "suspension" ? "btn-primary bg-danger hover:bg-danger" : "btn-primary"} disabled={pending}
              onClick={() => {
                if (form === "suspension" && !window.confirm(`Suspend ${vendorName}?`)) return;
                run(form, text);
              }}>
              {pending ? "Sending…" : LABEL[form]}
            </button>
            <button className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {next && (
            <button className={next === "suspension" ? "btn-ghost border-danger/40 text-danger" : "btn-primary"}
              onClick={() => { setForm(next); setText(NEXT_TEXT[next](vendorName, badCount)); }}>
              {LABEL[next]}
            </button>
          )}
          {current && (
            <button className="btn-ghost" disabled={pending} onClick={() => {
              if (window.confirm("Mark this case resolved? The vendor stays on the watchlist while they have recent bad reviews.")) run("resolved", "");
            }}>
              Resolve case
            </button>
          )}
          <span className="text-xs text-slate">
            {!current ? "Step 1 of 3: ask what happened." : current === "inquiry" ? "Step 2 of 3 if it continues: warn." : current === "warning" ? "Step 3 of 3 if it still continues: suspend." : "Suspended. Reinstate from Vendors when resolved."}
          </span>
        </div>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-teal" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
