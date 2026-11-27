"use client";

import { useState, useTransition } from "react";
import { renameVendor } from "../actions";

/** Vendor → My page (manager only): rename the business. The page link stays the same. */
export function RenameBusiness({ name }: { name: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [val, setVal] = useState(name);
  const trimmed = val.trim();
  const unchanged = trimmed === name.trim();

  return (
    <form
      className="mt-3"
      action={(fd) =>
        start(async () => {
          setErr(null);
          setOk(false);
          const r = await renameVendor(fd);
          if (r?.error) setErr(r.error);
          else setOk(true);
        })
      }
    >
      <label className="label" htmlFor="vname">Business name</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="vname"
          name="name"
          className="field min-w-[220px] flex-1"
          value={val}
          maxLength={80}
          onChange={(e) => { setVal(e.target.value); setOk(false); setErr(null); }}
        />
        <button className="btn-primary text-sm" disabled={pending || trimmed === "" || unchanged}>
          {pending ? "Saving…" : "Save name"}
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
      {ok && <p className="mt-1 text-xs text-teal">Saved. Your page, receipts and emails now show the new name.</p>}
    </form>
  );
}
