"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitApplication } from "./actions";
import { PARTNER_AGREEMENT_TITLE, PARTNER_AGREEMENT_ACCEPT, type AgreementClause } from "@/lib/legal";
import { AgreementText } from "@/components/ui/AgreementText";

export function ApplyForm({ agreement }: { agreement: AgreementClause[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="card p-6 text-center">
        <p className="font-display text-xl text-ink">Application received</p>
        <p className="mt-2 text-sm text-slate">
          Thanks — our team will review your details and reach out by email.
        </p>
        <Link href="/" className="btn-ghost mt-4 inline-block">Back to home</Link>
      </div>
    );
  }

  return (
    <form
      className="card space-y-3 p-6"
      action={(fd) => {
        setErr(null);
        start(async () => {
          const r = await submitApplication(fd);
          if (r && "error" in r && r.error) setErr(r.error);
          else setDone(true);
        });
      }}
    >
      <div>
        <label className="label">Business name</label>
        <input name="business_name" className="field" placeholder="Fresh & Fold Laundry" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Contact name</label>
          <input name="contact_name" className="field" placeholder="Your name" required />
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" className="field" placeholder="080…" required />
        </div>
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" className="field" placeholder="you@business.com" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Area</label>
          <input name="area" className="field" placeholder="Rayfield" />
        </div>
        <div>
          <label className="label">City</label>
          <input name="city" className="field" placeholder="Jos" />
        </div>
      </div>
      <div>
        <label className="label">Delivery</label>
        <select name="delivery" className="field" defaultValue="own_riders">
          <option value="own_riders">We have our own riders</option>
          <option value="dispatch_partner">We use a dispatch partner</option>
          <option value="both">Both</option>
        </select>
      </div>
      <div>
        <label className="label">Anything else (optional)</label>
        <textarea name="message" className="field min-h-[80px]" placeholder="Opening hours, services, volume…" />
      </div>
      <div className="rounded-card border border-ink/10 bg-ivory p-4">
        <p className="text-sm font-medium text-ink">{PARTNER_AGREEMENT_TITLE}</p>
        <AgreementText clauses={agreement} className="mt-2" />
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="agree" required className="mt-1" />
          <span>{PARTNER_AGREEMENT_ACCEPT}</span>
        </label>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Submitting…" : "Submit application"}
      </button>
      <p className="text-center text-xs text-slate">
        Already a partner? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </form>
  );
}
