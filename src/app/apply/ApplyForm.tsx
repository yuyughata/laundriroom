"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitApplication } from "./actions";
import { PARTNER_AGREEMENT_TITLE, PARTNER_AGREEMENT_ACCEPT, type AgreementClause } from "@/lib/legal";
import { AgreementText } from "@/components/ui/AgreementText";
import { PasswordInput } from "@/components/ui/PasswordInput";

export function ApplyForm({ agreement, signedIn }: { agreement: AgreementClause[]; signedIn: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="card p-6 text-center">
        <p className="font-display text-xl text-ink">Application received</p>
        <p className="mt-2 text-sm text-slate">
          Thanks — our team will review your details and reach out by email.
          {!signedIn && " Your account is ready: sign in anytime with the email and password you just set to track your application."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/apply/status" className="btn-primary inline-block">Check application status</Link>
          <Link href="/" className="btn-ghost inline-block">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="card space-y-3 p-6"
      action={(fd) => {
        setErr(null);
        if (!signedIn) {
          const pw = String(fd.get("password") || "");
          const confirm = String(fd.get("password_confirm") || "");
          if (pw.length < 8) { setErr("Choose a password of at least 8 characters."); return; }
          if (pw !== confirm) { setErr("The passwords don't match."); return; }
        }
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
      {!signedIn && (
        <div className="rounded-card border border-ink/10 bg-ivory p-4">
          <p className="text-sm font-medium text-ink">Create your partner login</p>
          <p className="mt-1 text-xs text-slate">
            Set a password so you can sign in and follow your application while we review it.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Password</label>
              <PasswordInput name="password" required minLength={8} className="field" placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <PasswordInput name="password_confirm" required minLength={8} className="field" placeholder="Repeat password" />
            </div>
          </div>
        </div>
      )}
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
