"use client";

import { useState, useTransition } from "react";
import { respondQualityAction } from "../actions";

export type OpenStep = {
  id: string; stage: "inquiry" | "warning" | "suspension"; message: string; created_at: string;
  vendor_response: string | null; responded_at: string | null;
};

/**
 * An open review-quality step from laundriroom (inquiry / warning /
 * suspension), shown at the top of Vendor → Reviews. The main manager replies
 * to an inquiry or warning here.
 */
export function QualityNotice({ step, canRespond }: { step: OpenStep; canRespond: boolean }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(step.vendor_response);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const title = step.stage === "inquiry" ? "laundriroom would like to understand your recent reviews"
    : step.stage === "warning" ? "Warning: low customer ratings are continuing"
    : "Your laundry is suspended from laundriroom";

  return (
    <section className={`mt-5 rounded-card border p-5 ${step.stage === "inquiry" ? "border-warn/30 bg-warn/5" : "border-danger/30 bg-danger/5"}`}>
      <p className={`font-display text-lg ${step.stage === "inquiry" ? "text-warn" : "text-danger"}`}>{title}</p>
      <p className="mt-2 whitespace-pre-line text-sm text-ink">{step.message}</p>
      <p className="mt-1 text-xs text-slate">{new Date(step.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}</p>

      {step.stage !== "suspension" && (sent ? (
        <p className="mt-3 rounded-card bg-white px-3 py-2 text-sm text-ink"><span className="font-medium">Your reply:</span> {sent}</p>
      ) : canRespond ? (
        <div className="mt-3 space-y-2">
          <label className="label" htmlFor="qa-reply">Your reply to laundriroom</label>
          <textarea id="qa-reply" className="field min-h-[100px]" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="What went wrong on these orders, and what you've done for each customer and to stop it happening again." />
          {err && <p className="text-sm text-danger">{err}</p>}
          <button className="btn-primary" disabled={pending}
            onClick={() => start(async () => {
              setErr(null);
              const r = await respondQualityAction(step.id, text);
              if ("error" in r && r.error) setErr(r.error); else setSent(text.trim());
            })}>
            {pending ? "Sending…" : "Send reply"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate">Your manager needs to reply to this.</p>
      ))}
    </section>
  );
}
