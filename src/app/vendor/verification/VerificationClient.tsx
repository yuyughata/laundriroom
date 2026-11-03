"use client";

import { useState, useTransition } from "react";
import { createClient as createBrowser } from "@/lib/supabase/client";
import { uploadVendorDoc, acceptVendorTerms } from "../actions";
import { PARTNER_AGREEMENT_TITLE, type AgreementClause } from "@/lib/legal";
import { AgreementText } from "@/components/ui/AgreementText";
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
  vendorId, docs, kycVerified, termsAcceptedAt, isManager, agreement, agreementUpdatedAt,
}: {
  vendorId: string; docs: VendorDocument[]; kycVerified: boolean;
  termsAcceptedAt: string | null; isManager: boolean;
  agreement: AgreementClause[]; agreementUpdatedAt: string | null;
}) {
  return (
    <div className="mt-6 space-y-6">
      <AgreementCard vendorId={vendorId} acceptedAt={termsAcceptedAt} isManager={isManager}
        clauses={agreement} updatedAt={agreementUpdatedAt} />
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

function AgreementCard({ vendorId, acceptedAt, isManager, clauses, updatedAt }: {
  vendorId: string; acceptedAt: string | null; isManager: boolean;
  clauses: AgreementClause[]; updatedAt: string | null;
}) {
  const [pending, start] = useTransition();
  // Accepted, and not before the agreement last changed.
  const current = Boolean(acceptedAt) && !(updatedAt && acceptedAt && new Date(acceptedAt) < new Date(updatedAt));
  const changedSince = Boolean(acceptedAt) && !current;
  const [accepted, setAccepted] = useState(current);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="rounded-card border border-ink/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg text-ink">{PARTNER_AGREEMENT_TITLE}</p>
        <span className={accepted ? "chip-ok" : "chip-warn"}>{accepted ? "Accepted" : "Action needed"}</span>
      </div>
      {changedSince && !accepted && (
        <p className="mt-2 rounded-card bg-warn/10 px-3 py-2 text-xs text-warn">
          The Partner Agreement was updated{updatedAt ? ` on ${new Date(updatedAt).toLocaleDateString()}` : ""} after you
          accepted it. Please review the current version and accept it again.
        </p>
      )}
      <AgreementText clauses={clauses} className="mt-2" />
      {accepted ? (
        <p className="mt-3 text-xs text-teal">
          Agreement accepted{acceptedAt && current ? ` on ${new Date(acceptedAt).toLocaleDateString()}` : ""}.
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
            {pending ? "Saving…" : "I agree to the Partner Agreement"}
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
