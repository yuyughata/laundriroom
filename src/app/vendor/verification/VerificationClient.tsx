"use client";

import { useState, useTransition } from "react";
import { createClient as createBrowser } from "@/lib/supabase/client";
import { uploadVendorDoc, acceptVendorTerms } from "../actions";
import { NON_CIRCUMVENTION_TITLE, NON_CIRCUMVENTION_CLAUSE } from "@/lib/legal";
import type { VendorDocument, VendorDocType } from "@/lib/database.types";

const DOC_LABEL: Record<VendorDocType, string> = {
  id: "Government ID",
  cac: "CAC registration certificate",
  other: "Other document",
};
const STATUS_CHIP: Record<string, string> = {
  pending: "chip-warn", approved: "chip-ok", rejected: "chip-muted",
};

export function VerificationClient({
  vendorId, docs, kycVerified, termsAcceptedAt, isManager,
}: {
  vendorId: string; docs: VendorDocument[]; kycVerified: boolean;
  termsAcceptedAt: string | null; isManager: boolean;
}) {
  return (
    <div className="mt-6 space-y-6">
      <AgreementCard vendorId={vendorId} acceptedAt={termsAcceptedAt} isManager={isManager} />
      <div className="rounded-card border border-ink/10 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-lg text-ink">Verification status</p>
            <p className="text-sm text-slate">
              You can take orders right away — verification runs in the background.
            </p>
          </div>
          <span className={kycVerified ? "chip-ok" : "chip-warn"}>
            {kycVerified ? "Verified" : "Awaiting documents"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Uploader vendorId={vendorId} type="id" />
        <Uploader vendorId={vendorId} type="cac" />
      </div>

      <div className="rounded-card border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-5 py-3 text-sm font-medium text-ink">Uploaded documents</div>
        {docs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate">Nothing uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-ink/5">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{DOC_LABEL[d.type]}</p>
                  <p className="text-xs text-slate">
                    {d.original_name ?? d.file_path.split("/").pop()}
                    {d.note ? ` · ${d.note}` : ""}
                  </p>
                </div>
                <span className={STATUS_CHIP[d.status]}>{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AgreementCard({ vendorId, acceptedAt, isManager }: { vendorId: string; acceptedAt: string | null; isManager: boolean }) {
  const [pending, start] = useTransition();
  const [accepted, setAccepted] = useState(Boolean(acceptedAt));
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="rounded-card border border-ink/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg text-ink">{NON_CIRCUMVENTION_TITLE}</p>
        <span className={accepted ? "chip-ok" : "chip-warn"}>{accepted ? "Accepted" : "Action needed"}</span>
      </div>
      <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate">
        {NON_CIRCUMVENTION_CLAUSE.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      {accepted ? (
        <p className="mt-3 text-xs text-teal">
          Agreement accepted{acceptedAt ? ` on ${new Date(acceptedAt).toLocaleDateString()}` : ""}.
        </p>
      ) : isManager ? (
        <div className="mt-3">
          <button className="btn-primary" disabled={pending}
            onClick={() => {
              setErr(null);
              start(async () => {
                const r = await acceptVendorTerms(vendorId);
                if (r && "error" in r && r.error) setErr(r.error);
                else setAccepted(true);
              });
            }}>
            {pending ? "Saving…" : "I agree to the Vendor Agreement"}
          </button>
          {err && <p className="mt-2 text-xs text-danger">{err}</p>}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate">Your manager needs to accept this agreement.</p>
      )}
    </div>
  );
}

function Uploader({ vendorId, type }: { vendorId: string; type: VendorDocType }) {
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="rounded-card border border-ink/10 bg-white p-5">
      <p className="label">{DOC_LABEL[type]}</p>
      <input type="file" accept="image/*,application/pdf" className="text-sm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button className="btn-primary mt-3 w-full" disabled={pending || !file}
        onClick={() => {
          if (!file) return;
          setMsg(null);
          start(async () => {
            const sb = createBrowser();
            const path = `${vendorId}/${type}-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
            const { error } = await sb.storage.from("vendor-docs").upload(path, file);
            if (error) { setMsg(error.message); return; }
            const fd = new FormData();
            fd.set("vendor_id", vendorId); fd.set("type", type);
            fd.set("file_path", path); fd.set("original_name", file.name);
            const r = await uploadVendorDoc(fd);
            setMsg(r && "error" in r && r.error ? r.error : "Uploaded — pending review.");
            if (!(r && "error" in r)) setFile(null);
          });
        }}>
        {pending ? "Uploading…" : "Upload"}
      </button>
      {msg && <p className="mt-2 text-xs text-teal">{msg}</p>}
    </div>
  );
}
