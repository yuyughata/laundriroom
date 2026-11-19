"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount } from "./actions";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    setErr(null);
    start(async () => {
      const r = await deleteMyAccount(text);
      if (r?.error) { setErr(r.error); return; }
      // Signed out server-side; leave the app.
      window.location.href = "/?deleted=1";
    });
  }

  return (
    <section className="mt-10 rounded-card border border-danger/30 bg-danger/5 p-5">
      <h2 className="font-display text-lg text-danger">Delete my account</h2>
      <p className="mt-1 text-xs text-slate">
        Permanently delete your account and personal details. Your saved addresses are removed and your
        login is disabled. Records of past orders are kept in anonymised form where the law requires it.
        This can&apos;t be undone.
      </p>

      {!open ? (
        <button className="btn-ghost mt-3 text-sm text-danger" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      ) : (
        <div className="mt-3">
          <label className="label">Type <span className="font-semibold">DELETE</span> to confirm</label>
          <input
            className="field mt-1 max-w-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />
          {err && <p className="mt-2 text-sm text-danger">{err}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-primary bg-danger text-sm hover:bg-danger/90"
              disabled={pending || text.trim().toUpperCase() !== "DELETE"}
              onClick={confirm}
            >
              {pending ? "Deleting…" : "Permanently delete"}
            </button>
            <button className="btn-ghost text-sm" disabled={pending} onClick={() => { setOpen(false); setText(""); setErr(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
