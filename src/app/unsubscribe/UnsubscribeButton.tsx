"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { unsubscribe } from "./actions";

export function UnsubscribeButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    return (
      <div>
        <h1 className="font-display text-3xl text-ink">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-slate">
          Thanks, {done}. You won&apos;t get laundriroom news, offers or announcements any more. You&apos;ll still get emails about
          your own orders and your account.
        </p>
        <p className="mt-6 text-sm text-slate">
          Changed your mind? Turn them back on in your{" "}
          <Link href="/customer/account" className="text-ink underline">account</Link>.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Unsubscribe from laundriroom emails?</h1>
      <p className="mt-3 text-slate">
        You&apos;ll stop getting laundriroom news, offers and announcements by email. Emails about your own orders and your
        account will still come.
      </p>
      {err && <p className="mt-4 text-sm text-danger">{err}</p>}
      <button className="btn-primary mt-6" disabled={pending}
        onClick={() => start(async () => {
          setErr(null);
          const r = await unsubscribe(token);
          if ("error" in r) setErr(r.error); else setDone(r.name);
        })}>
        {pending ? "Unsubscribing…" : "Unsubscribe"}
      </button>
    </div>
  );
}
