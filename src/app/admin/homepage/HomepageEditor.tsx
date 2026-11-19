"use client";

import { useState, useTransition } from "react";
import { HOMEPAGE_SECTIONS } from "@/lib/homepageContent";
import { saveHomepageContent, resetHomepageContent } from "./actions";

export function HomepageEditor({ values }: { values: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);

  function onSave(fd: FormData) {
    setMsg(null);
    start(async () => {
      const r = await saveHomepageContent(fd);
      setMsg(r?.error ? { text: r.error } : { ok: true, text: "Saved — the homepage is updated." });
    });
  }

  function onReset() {
    if (!window.confirm("Reset ALL homepage copy to the built-in defaults? This clears every change.")) return;
    setMsg(null);
    start(async () => {
      const r = await resetHomepageContent();
      if (r?.error) setMsg({ text: r.error });
      else { setMsg({ ok: true, text: "Reset to defaults." }); window.location.reload(); }
    });
  }

  return (
    <form action={onSave} className="mt-6 space-y-8">
      {HOMEPAGE_SECTIONS.map((section) => (
        <section key={section.title} className="card p-5">
          <h2 className="font-display text-lg text-ink">{section.title}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {section.fields.map((f) => {
              const current = values[f.key] ?? "";
              return (
                <div key={f.key} className={f.multiline ? "sm:col-span-2" : ""}>
                  <label className="label" htmlFor={f.key}>{f.label}</label>
                  {f.multiline ? (
                    <textarea id={f.key} name={f.key} rows={3} className="field" defaultValue={current} placeholder={f.default} />
                  ) : (
                    <input id={f.key} name={f.key} className="field" defaultValue={current} placeholder={f.default} />
                  )}
                  <p className="mt-1 text-xs text-slate">
                    {f.hint ? `${f.hint} ` : ""}Default: <span className="text-ink/70">{f.default}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-teal" : "text-danger"}`}>{msg.text}</p>
      )}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-ink/10 bg-ivory/95 px-1 py-3 backdrop-blur">
        <button className="btn-primary text-sm" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
        <button type="button" className="btn-ghost text-sm" disabled={pending} onClick={onReset}>Reset all to defaults</button>
        <a href="/" target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm">View homepage ↗</a>
        <span className="text-xs text-slate">Leave a field blank to use its default. Changes go live immediately.</span>
      </div>
    </form>
  );
}
