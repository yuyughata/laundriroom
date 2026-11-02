"use client";

import { useState, useTransition } from "react";
import { addExpense } from "../actions";
import { createClient } from "@/lib/supabase/client";

export function AddExpense({ vendorId }: { vendorId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!open) return <button className="btn-primary text-sm" onClick={() => setOpen(true)}>Add expense</button>;

  async function submit() {
    setErr(null);
    let receipt_path = "";
    if (file) {
      setUploading(true);
      const supabase = createClient();
      const path = `${vendorId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("receipts").upload(path, file);
      setUploading(false);
      if (error) { setErr(`Receipt upload failed: ${error.message}`); return; }
      receipt_path = path;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("vendor_id", vendorId); fd.set("amount", amount); fd.set("reason", reason);
      if (receipt_path) fd.set("receipt_path", receipt_path);
      const r = await addExpense(fd);
      if (r?.error) setErr(r.error);
      else { setOpen(false); setAmount(""); setReason(""); setFile(null); }
    });
  }

  return (
    <div className="card max-w-md p-5">
      <p className="font-medium text-ink">Record an expense</p>
      <div className="mt-3 space-y-3">
        <input className="field" inputMode="numeric" placeholder="Amount (₦)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="field" placeholder="What was it for? (e.g. detergent, power)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div>
          <label className="label">Receipt (optional)</label>
          <input type="file" accept="image/*,application/pdf" className="text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        <div className="flex gap-2">
          <button className="btn-primary text-sm" disabled={pending || uploading || !amount} onClick={submit}>
            {uploading ? "Uploading…" : pending ? "Saving…" : "Save expense"}
          </button>
          <button className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
