"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "./RichTextEditor";
import { ImageSlot } from "./ImageSlot";
import { renderNewsletter } from "@/lib/newsletter";
import {
  saveNewsletter, sendTestNewsletter, sendNewsletter, countAudience, searchPeople, deleteNewsletter,
  type NewsletterInput, type PersonHit,
} from "@/app/admin/emails/actions";
import type { NewsletterAudience, NewsletterGroup } from "@/lib/database.types";
import { EMAIL_KINDS, type EmailKind } from "@/lib/emailKinds";

const GROUPS: { key: NewsletterGroup; label: string; hint: string }[] = [
  { key: "customers", label: "Customers", hint: "Everyone who orders laundry" },
  { key: "vendor_managers", label: "Laundry managers", hint: "Partner managers" },
  { key: "vendor_staff", label: "All laundry staff", hint: "Managers, attendants and riders" },
  { key: "team", label: "laundriroom team", hint: "Admins and support" },
  { key: "everyone", label: "Everyone", hint: "All of the above" },
];
const ROLE_LABEL: Record<string, string> = {
  customer: "Customer", vendor_manager: "Manager", attendant: "Attendant", rider: "Rider",
  platform_admin: "Admin", support_agent: "Support",
};

export type EditorStart = NewsletterInput & { id: string | null; last_test_at: string | null };

export function NewsletterEditor({ start, people: startPeople }: { start: EditorStart; people: PersonHit[] }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(start.id);
  const [kind, setKind] = useState<EmailKind>(start.kind ?? "newsletter");
  const [subject, setSubject] = useState(start.subject);
  const [preheader, setPreheader] = useState(start.preheader);
  const [header, setHeader] = useState<string | null>(start.header_image_url);
  const [footer, setFooter] = useState<string | null>(start.footer_image_url);
  const [body, setBody] = useState(start.body_html);
  const [ctaLabel, setCtaLabel] = useState(start.cta_label);
  const [ctaUrl, setCtaUrl] = useState(start.cta_url);
  const [groups, setGroups] = useState<NewsletterGroup[]>(start.audience.groups);
  const [people, setPeople] = useState<PersonHit[]>(startPeople);
  const [count, setCount] = useState<number | null>(null);
  const [view, setView] = useState<"desktop" | "phone">("desktop");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start_] = useTransition();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const audience: NewsletterAudience = useMemo(() => ({ groups, user_ids: people.map((p) => p.id) }), [groups, people]);
  const input = (): NewsletterInput => ({
    kind, subject, preheader, header_image_url: header, footer_image_url: footer, body_html: body,
    cta_label: ctaLabel, cta_url: ctaUrl, audience,
  });
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  // recipients count, debounced
  useEffect(() => {
    let live = true;
    setCount(null);
    const t = setTimeout(async () => {
      const r = await countAudience(audience);
      if (live) setCount("error" in r ? null : r.count);
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [audience]);

  // warn before leaving with unsaved edits
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const preview = useMemo(() => renderNewsletter(
    { subject: subject || "Subject", preheader, headerImageUrl: header, footerImageUrl: footer, bodyHtml: body, ctaLabel, ctaUrl },
    { iconUrl: `${origin}/brand/mark-email.png`, unsubscribeUrl: "#" },
  ), [subject, preheader, header, footer, body, ctaLabel, ctaUrl, origin]);

  async function save(): Promise<string | null> {
    const r = await saveNewsletter(id, input());
    if ("error" in r) { setMsg({ tone: "err", text: r.error ?? "Couldn’t save." }); return null; }
    setDirty(false);
    if (!id) setId(r.id);
    return r.id;
  }

  function toggleGroup(g: NewsletterGroup) {
    setDirty(true);
    setGroups((cur) => g === "everyone"
      ? (cur.includes("everyone") ? [] : ["everyone"])
      : cur.includes(g) ? cur.filter((x) => x !== g) : [...cur.filter((x) => x !== "everyone"), g]);
  }

  const everyone = groups.includes("everyone");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,620px)]">
      {/* ── Compose ─────────────────────────────────────────────── */}
      <div className="space-y-5">
        <div className="card space-y-3 p-4">
          <div>
            <p className="label" id="nl-kind">Type of email</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="nl-kind">
              {EMAIL_KINDS.map((k) => (
                <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} title={k.hint}
                  onClick={() => { setKind(k.key); setDirty(true); }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${kind === k.key ? "border-ink bg-ink text-ivory" : "border-ink/15 text-ink hover:bg-ink/5"}`}>
                  {k.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate">{EMAIL_KINDS.find((k) => k.key === kind)?.hint}</p>
          </div>
          <div>
            <label className="label" htmlFor="nl-subject">Subject</label>
            <input id="nl-subject" className="field" maxLength={200} value={subject} placeholder="What's new at laundriroom"
              onChange={(e) => touch(setSubject)(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="nl-pre">Preview text <span className="font-normal text-slate">(shown after the subject in the inbox)</span></label>
            <input id="nl-pre" className="field" maxLength={200} value={preheader} placeholder="A line that makes people open it"
              onChange={(e) => touch(setPreheader)(e.target.value)} />
          </div>
        </div>

        <ImageSlot label="Header image" hint="Top of the email. 1200 × 400 px works well (shown 560 px wide)."
          url={header} onChange={touch(setHeader)} />

        <div>
          <p className="label">Message</p>
          <RichTextEditor value={body} onChange={touch(setBody)} placeholder="Write your email…" />
        </div>

        <div className="card grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="nl-cta">Button text</label>
            <input id="nl-cta" className="field" maxLength={60} value={ctaLabel} placeholder="Book a pickup"
              onChange={(e) => touch(setCtaLabel)(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="nl-cta-url">Button link</label>
            <input id="nl-cta-url" className="field" value={ctaUrl} placeholder="https://…" inputMode="url"
              onChange={(e) => touch(setCtaUrl)(e.target.value)} />
          </div>
          <p className="text-xs text-slate sm:col-span-2">Shown below the message. Leave both empty for no button.</p>
        </div>

        <ImageSlot label="Footer image" hint="Bottom of the email, after the button. Any height; 1200 px wide."
          url={footer} onChange={touch(setFooter)} />

        {/* ── Audience ───────────────────────────────────────────── */}
        <div className="card p-4">
          <p className="font-medium text-ink">Send to</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {GROUPS.map((g) => {
              const on = groups.includes(g.key) || (everyone && g.key !== "everyone");
              return (
                <label key={g.key} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${on ? "border-ink bg-ink/5" : "border-ink/15"} ${everyone && g.key !== "everyone" ? "opacity-60" : ""}`}>
                  <input type="checkbox" className="mt-1" checked={on} disabled={everyone && g.key !== "everyone"}
                    onChange={() => toggleGroup(g.key)} />
                  <span><span className="block text-sm font-medium text-ink">{g.label}</span>
                    <span className="block text-xs text-slate">{g.hint}</span></span>
                </label>
              );
            })}
          </div>
          <PeoplePicker people={people} onChange={(p) => { setPeople(p); setDirty(true); }} />
          <p className="mt-3 text-sm text-ink">
            {count == null ? "Counting…" : <><span className="font-semibold">{count}</span> {count === 1 ? "person" : "people"} will get it</>}
          </p>
          <p className="text-xs text-slate">Only active accounts with an email who haven&apos;t unsubscribed.</p>
        </div>

        {/* ── Actions ────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" disabled={pending} onClick={() => start_(async () => {
            setMsg(null); if (await save()) setMsg({ tone: "ok", text: "Draft saved." });
          })}>Save draft</button>
          <button className="btn-ghost" disabled={pending} onClick={() => start_(async () => {
            setMsg(null);
            const nid = await save(); if (!nid) return;
            const r = await sendTestNewsletter(nid);
            setMsg("error" in r ? { tone: "err", text: r.error ?? "Couldn’t send." } : { tone: "ok", text: `Test sent to ${r.to}.` });
          })}>Send test to me</button>
          <button className="btn-primary" disabled={pending || !count} onClick={() => start_(async () => {
            setMsg(null); if (await save()) setConfirming(true);
          })}>Send…</button>
          {id && (
            <button className="ml-auto text-sm text-danger underline" disabled={pending} onClick={() => start_(async () => {
              if (!window.confirm("Delete this draft?")) return;
              const r = await deleteNewsletter(id);
              if ("error" in r) setMsg({ tone: "err", text: r.error ?? "Couldn’t delete." }); else { setDirty(false); router.push("/admin/emails"); }
            })}>Delete draft</button>
          )}
        </div>
        {msg && <p className={`text-sm ${msg.tone === "ok" ? "text-teal" : "text-danger"}`} role="status">{msg.text}</p>}

        {confirming && id && (
          <div className="card border-ink p-4" role="alertdialog" aria-label="Confirm send">
            <p className="font-medium text-ink">Send “{subject}” to {count} {count === 1 ? "person" : "people"}?</p>
            <p className="mt-1 text-sm text-slate">It goes out straight away and can&apos;t be unsent. Sent emails are kept as a record and can&apos;t be edited (you can duplicate one).</p>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" disabled={pending} onClick={() => start_(async () => {
                const r = await sendNewsletter(id);
                setConfirming(false);
                if ("error" in r) setMsg({ tone: "err", text: r.error ?? "Couldn’t send." });
                else router.refresh();
              })}>{pending ? "Sending…" : "Yes, send it"}</button>
              <button className="btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Preview ──────────────────────────────────────────────── */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">Preview</p>
          <div className="flex rounded-full border border-ink/15 p-0.5 text-xs">
            {(["desktop", "phone"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 ${view === v ? "bg-ink text-ivory" : "text-ink"}`}>{v === "desktop" ? "Desktop" : "Phone"}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-center rounded-card border border-ink/10 bg-ivory-deep p-3">
          <iframe title="Email preview" sandbox="" srcDoc={preview}
            className="h-[760px] rounded-lg bg-white" style={{ width: view === "desktop" ? 600 : 375, maxWidth: "100%" }} />
        </div>
        <p className="mt-2 text-xs text-slate">This is how it looks in most email apps. Send a test to see it in your own inbox.</p>
      </div>
    </div>
  );
}

function PeoplePicker({ people, onChange }: { people: PersonHit[]; onChange: (p: PersonHit[]) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    if (q.trim().length < 2) { setHits([]); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await searchPeople(q);
      if (n !== seq.current) return;
      setBusy(false);
      setHits("error" in r ? [] : r.people);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-4">
      <label className="label" htmlFor="nl-people">Also send to particular people</label>
      <input id="nl-people" className="field" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <div className="mt-1 max-h-56 overflow-auto rounded-lg border border-ink/10 bg-white">
          {busy && <p className="px-3 py-2 text-sm text-slate">Searching…</p>}
          {!busy && hits.length === 0 && <p className="px-3 py-2 text-sm text-slate">No one found.</p>}
          {hits.map((p) => {
            const added = people.some((x) => x.id === p.id);
            return (
              <button key={p.id} type="button" disabled={added || p.opted_out}
                onClick={() => { onChange([...people, p]); setQ(""); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink/5 disabled:opacity-60">
                <span><span className="text-ink">{p.full_name || p.email}</span> <span className="text-slate">· {p.email}</span></span>
                <span className="shrink-0 text-xs text-slate">
                  {p.opted_out ? "Unsubscribed" : added ? "Added" : ROLE_LABEL[p.role] ?? p.role}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {people.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {people.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-3 py-1 text-xs text-ink">
              {p.full_name || p.email}{p.opted_out ? " (unsubscribed)" : ""}
              <button type="button" aria-label={`Remove ${p.full_name || p.email}`} className="ml-1 text-slate hover:text-ink"
                onClick={() => onChange(people.filter((x) => x.id !== p.id))}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
