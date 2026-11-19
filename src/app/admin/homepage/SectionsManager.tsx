"use client";

import { useState, useTransition } from "react";
import type { HomeSectionRow } from "@/lib/homepageSections";
import {
  addSection, duplicateSection, updateSection, setSectionActive, deleteSection, moveSection,
} from "./actions";

export function SectionsManager({ sections }: { sections: HomeSectionRow[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string } | void>) => {
    setErr(null);
    start(async () => { const r = await fn(); if (r && "error" in r && r.error) setErr(r.error); });
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">Custom sections</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            Add your own sections to the landing page (they appear just above the final call to action).
            Duplicate one as a starting point, reorder, hide, or remove them.
          </p>
        </div>
        <button className="btn-primary text-sm" disabled={pending} onClick={() => run(() => addSection())}>
          + Add section
        </button>
      </div>

      {err && <p className="mt-3 text-sm text-danger">{err}</p>}

      {sections.length === 0 ? (
        <p className="mt-4 rounded-card border border-ink/10 bg-white p-5 text-sm text-slate">
          No custom sections yet. Click <span className="font-medium text-ink">Add section</span> to create one.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {sections.map((s, i) => (
            <SectionCard key={s.id} section={s} isFirst={i === 0} isLast={i === sections.length - 1}
              pending={pending} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionCard({
  section: s, isFirst, isLast, pending, run,
}: {
  section: HomeSectionRow; isFirst: boolean; isLast: boolean; pending: boolean;
  run: (fn: () => Promise<{ error?: string } | void>) => void;
}) {
  const [saved, setSaved] = useState(false);

  function onSave(fd: FormData) {
    setSaved(false);
    run(async () => {
      const r = await updateSection(s.id, fd);
      if (!r?.error) setSaved(true);
      return r;
    });
  }

  return (
    <form action={onSave} className={`card p-5 ${s.active ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={s.tone === "dark" ? "chip-ink" : "chip-muted"}>{s.tone === "dark" ? "Dark" : "Light"}</span>
          {!s.active && <span className="chip-warn">Hidden</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={pending || isFirst}
            onClick={() => run(() => moveSection(s.id, -1))} aria-label="Move up">↑</button>
          <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={pending || isLast}
            onClick={() => run(() => moveSection(s.id, 1))} aria-label="Move down">↓</button>
          <button type="button" className="btn-ghost px-3 py-1 text-xs" disabled={pending}
            onClick={() => run(() => duplicateSection(s.id))}>Duplicate</button>
          <button type="button" className="btn-ghost px-3 py-1 text-xs" disabled={pending}
            onClick={() => run(() => setSectionActive(s.id, !s.active))}>{s.active ? "Hide" : "Show"}</button>
          <button type="button" className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending}
            onClick={() => { if (window.confirm("Delete this section?")) run(() => deleteSection(s.id)); }}>Delete</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Eyebrow (optional)</label>
          <input name="eyebrow" className="field" defaultValue={s.eyebrow ?? ""} placeholder="e.g. New" />
        </div>
        <div>
          <label className="label">Style</label>
          <select name="tone" className="field" defaultValue={s.tone === "dark" ? "dark" : "light"}>
            <option value="light">Light (ivory background)</option>
            <option value="dark">Dark (ink background)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Heading</label>
          <input name="heading" className="field" required defaultValue={s.heading} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Body (optional)</label>
          <textarea name="body" rows={3} className="field" defaultValue={s.body ?? ""} />
        </div>
        <div>
          <label className="label">Button label (optional)</label>
          <input name="cta_label" className="field" defaultValue={s.cta_label ?? ""} placeholder="e.g. Book now" />
        </div>
        <div>
          <label className="label">Button link (optional)</label>
          <input name="cta_href" className="field" defaultValue={s.cta_href ?? ""} placeholder="/signup or https://…" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary text-sm" disabled={pending}>Save section</button>
        {saved && <span className="text-sm text-teal">Saved.</span>}
      </div>
    </form>
  );
}
