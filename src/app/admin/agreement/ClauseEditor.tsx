"use client";

import { useState, useTransition } from "react";
import { addClause, updateClause, setClauseActive, deleteClause, moveClause } from "./actions";
import { toParagraphs } from "@/lib/legal";

export type ClauseRow = { id: string; position: number; title: string; body: string; active: boolean; updated_at: string };

export function ClauseEditor({ clause, index, isFirst, isLast }: {
  clause: ClauseRow; index: number; isFirst: boolean; isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string } | { ok: boolean } | undefined>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r && "error" in r && r.error) setErr(r.error);
    });

  return (
    <div className={`card p-5 ${clause.active ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate">Clause {index + 1}</p>
          <p className="font-display text-lg text-ink">{clause.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!clause.active && <span className="chip-muted">Hidden</span>}
          <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={pending || isFirst} aria-label="Move up"
            onClick={() => run(() => moveClause(clause.id, -1))}>↑</button>
          <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={pending || isLast} aria-label="Move down"
            onClick={() => run(() => moveClause(clause.id, 1))}>↓</button>
          {!editing && <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>Edit</button>}
        </div>
      </div>

      {editing ? (
        <form className="mt-3 space-y-3" action={(fd) => run(async () => {
          const r = await updateClause(clause.id, fd);
          if (!("error" in r)) setEditing(false);
          return r;
        })}>
          <div>
            <label className="label" htmlFor={`t-${clause.id}`}>Title</label>
            <input id={`t-${clause.id}`} name="title" className="field" defaultValue={clause.title} required maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor={`b-${clause.id}`}>Text</label>
            <textarea id={`b-${clause.id}`} name="body" className="field min-h-[180px]" defaultValue={clause.body} required />
            <p className="mt-1 text-xs text-slate">Leave a blank line between paragraphs.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save clause"}</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink/80">
          {toParagraphs(clause.body).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink/5 pt-3 text-xs">
        <button className="text-slate underline hover:text-ink" disabled={pending}
          onClick={() => run(() => setClauseActive(clause.id, !clause.active))}>
          {clause.active ? "Hide from the agreement" : "Show in the agreement"}
        </button>
        <button className="text-danger underline" disabled={pending}
          onClick={() => {
            if (window.confirm(`Delete the clause "${clause.title}"? This can't be undone.`)) run(() => deleteClause(clause.id));
          }}>
          Delete
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}

export function NewClause() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return <button className="btn-primary" onClick={() => setOpen(true)}>Add a clause</button>;
  }
  return (
    <form className="card space-y-3 p-5" action={(fd) => start(async () => {
      setErr(null);
      const r = await addClause(fd);
      if ("error" in r && r.error) setErr(r.error); else setOpen(false);
    })}>
      <p className="font-display text-lg text-ink">New clause</p>
      <div>
        <label className="label" htmlFor="new-title">Title</label>
        <input id="new-title" name="title" className="field" required maxLength={120}
          placeholder="e.g. Service standards, Data protection, Termination" />
      </div>
      <div>
        <label className="label" htmlFor="new-body">Text</label>
        <textarea id="new-body" name="body" className="field min-h-[160px]" required />
        <p className="mt-1 text-xs text-slate">Leave a blank line between paragraphs. It&apos;s added at the end of the agreement.</p>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Adding…" : "Add clause"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
