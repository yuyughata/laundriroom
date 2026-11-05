"use client";

import { useMemo, useState, useTransition } from "react";
import { assignRider } from "@/app/vendor/actions";
import { phoneKey, telHref, whatsappHref } from "@/lib/phone";
import type { RiderContact } from "@/lib/database.types";

/**
 * Assign a rider on an order: pick from the laundry's rider list, or type a
 * new one (saved to the list by default). Shows the assigned rider with
 * Call / WhatsApp, the WhatsApp message carrying the order code and PIN.
 */
export function RiderPicker({ orderId, orderCode, handoverCode, contacts, current }: {
  orderId: string; orderCode: string; handoverCode: string | null;
  contacts: RiderContact[];
  current: { name: string | null; phone: string | null; contactId: string | null };
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(contacts.length === 0 && !current.name);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<"own" | "dispatch">("own");
  const [company, setCompany] = useState("");
  const [save, setSave] = useState(true);
  const [changing, setChanging] = useState(!current.name);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = q.replace(/\D/g, "");                       // typed digits, any format
    const local = d.replace(/^234/, "").replace(/^0/, ""); // 0803… / +234 803… → 803…
    const list = contacts.filter((c) => !t || c.name.toLowerCase().includes(t) || (c.company ?? "").toLowerCase().includes(t)
      || (d.length >= 3 && (c.phone.replace(/\D/g, "").includes(d) || (local.length >= 3 && c.phone_key.includes(local)))));
    return list.slice(0, 8);
  }, [q, contacts]);

  // a typed number that's already on the list
  const known = phoneKey(phone).length >= 7 ? contacts.find((c) => c.phone_key === phoneKey(phone)) : undefined;

  function go(rider: Parameters<typeof assignRider>[1]) {
    setErr(null);
    start(async () => {
      const r = await assignRider(orderId, rider);
      if (r && "error" in r && r.error) setErr(r.error);
      else { setChanging(false); setAdding(false); setQ(""); setName(""); setPhone(""); setCompany(""); }
    });
  }

  const message = `Hello ${current.name ?? ""}, please deliver laundriroom order ${orderCode}.${
    handoverCode ? ` Handover code: ${handoverCode}.` : ""} The customer confirms with their PIN at the door.`;

  return (
    <div className="mb-3 rounded-card border border-ink/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink">Rider</p>
        {current.name && !changing && (
          <button type="button" className="text-xs text-slate underline" onClick={() => setChanging(true)}>Change</button>
        )}
      </div>

      {current.name && !changing ? (
        <div className="mt-2 rounded-card bg-ink/5 p-3 text-sm text-ink">
          <p className="font-medium">{current.name}{current.phone ? ` · ${current.phone}` : ""}</p>
          <p className="mt-1 text-xs text-slate">
            Order code <span className="font-mono text-ink">{orderCode}</span>
            {handoverCode ? <> · handover code <span className="font-mono text-ink">{handoverCode}</span></> : null}
          </p>
          {current.phone && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a className="btn-ghost px-3 py-1.5 text-xs" href={telHref(current.phone)}>Call</a>
              <a className="btn-ghost px-3 py-1.5 text-xs" href={whatsappHref(current.phone, message)} target="_blank" rel="noopener noreferrer">WhatsApp the details</a>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {!adding && (
            <>
              <input className="field" placeholder="Search riders by name, phone or company" value={q}
                aria-label="Search riders" onChange={(e) => setQ(e.target.value)} />
              <div className="max-h-56 overflow-auto rounded-lg border border-ink/10 bg-white">
                {matches.map((c) => (
                  <button key={c.id} type="button" disabled={pending} onClick={() => go({ contactId: c.id })}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink/5">
                    <span>
                      <span className="text-ink">{c.name}</span>
                      <span className="text-slate"> · {c.phone}</span>
                      {c.notes && <span className="block text-xs text-slate">{c.notes}</span>}
                    </span>
                    <span className={c.kind === "dispatch" ? "chip-warn shrink-0" : "chip-muted shrink-0"}>
                      {c.kind === "dispatch" ? (c.company || "Dispatch") : "Own rider"}
                    </span>
                  </button>
                ))}
                {matches.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate">{contacts.length ? "No rider matches." : "No riders saved yet."}</p>
                )}
              </div>
              <button type="button" className="btn-ghost w-full justify-center text-xs" onClick={() => { setAdding(true); setName(q && !/\d/.test(q) ? q : ""); setPhone(/\d/.test(q) ? q : ""); }}>
                + New rider
              </button>
            </>
          )}

          {adding && (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="field" placeholder="Rider name" aria-label="Rider name" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="field" placeholder="Phone" aria-label="Rider phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["own", "dispatch"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                    className={`rounded-full border px-3 py-1 ${kind === k ? "border-ink bg-ink text-ivory" : "border-ink/15 text-ink"}`}>
                    {k === "own" ? "Our own rider" : "Dispatch company"}
                  </button>
                ))}
              </div>
              {kind === "dispatch" && (
                <input className="field" placeholder="Company (e.g. GIG Logistics)" aria-label="Dispatch company" value={company} onChange={(e) => setCompany(e.target.value)} />
              )}
              {known && <p className="text-xs text-warn">{known.name} already has this number — they&apos;ll be used.</p>}
              <label className="flex items-center gap-2 text-xs text-ink">
                <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save to Dispatch list
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-primary flex-1 justify-center text-xs" disabled={pending}
                  onClick={() => go({ name, phone, kind, company, save })}>{pending ? "Assigning…" : "Assign rider"}</button>
                {contacts.length > 0 && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => setAdding(false)}>Back to list</button>
                )}
              </div>
            </div>
          )}

          {current.name && (
            <div className="flex justify-between text-xs">
              <button type="button" className="text-slate underline" onClick={() => { setChanging(false); setAdding(false); }}>Keep {current.name}</button>
              <button type="button" className="text-danger underline" disabled={pending} onClick={() => go({ name: "", phone: "", save: false })}>Remove rider</button>
            </div>
          )}
        </div>
      )}
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}
