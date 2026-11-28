"use client";

import { useState } from "react";

/**
 * Admin → Mailing list toolbar: copy every subscriber email (for a BCC blast)
 * and download the whole list as CSV. Data is passed in from the server page.
 */
export function MailingListTools({
  emails,
  rows,
}: {
  emails: string[];
  rows: { email: string; phone: string | null; created_at: string }[];
}) {
  const [copied, setCopied] = useState(false);

  function copyEmails() {
    const text = emails.join(", ");
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {},
    );
  }

  function downloadCsv() {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const header = "email,phone,signed_up\n";
    const body = rows
      .map((r) => [esc(r.email), esc(r.phone ?? ""), esc(r.created_at)].join(","))
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laundriroom-mailing-list-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (emails.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-ghost text-sm" onClick={copyEmails}>
        {copied ? "Copied ✓" : "Copy all emails"}
      </button>
      <button type="button" className="btn-ghost text-sm" onClick={downloadCsv}>
        Download CSV
      </button>
      <a className="btn-ghost text-sm" href={`mailto:?bcc=${encodeURIComponent(emails.join(","))}`}>
        Email all (BCC)
      </a>
    </div>
  );
}
