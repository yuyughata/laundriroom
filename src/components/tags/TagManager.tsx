"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { generateTagBatch, searchTags, setTagStatus } from "@/lib/tagActions";
import { QrScanner } from "@/components/ui/QrScanner";
import type { BatchRow, TagOverview } from "@/lib/tagData";
import type { Tag } from "@/lib/database.types";
import { DEFAULT_TAG_SIZE_MM, TAG_SIZES_MM, tagSizeFrom, tagSizeLabel, tagsPerPage, type TagSizeMm } from "@/lib/tagSizes";

type TagRow = Pick<Tag, "id" | "code" | "status" | "serial" | "print_count" | "last_printed_at" | "status_note" | "status_changed_at" | "current_item_id">;

const STATUS: Record<string, { label: string; chip: string }> = {
  free: { label: "Ready", chip: "chip-ok" },
  in_use: { label: "On an item", chip: "chip-ink" },
  missing: { label: "Missing", chip: "chip-warn" },
  damaged: { label: "Damaged", chip: "chip-warn" },
  retired: { label: "Retired", chip: "chip-muted" },
};
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—");

// Print size (square tags, mm), remembered on this device.
const SIZE_KEY = "lr.tagSizeMm";
const SizeCtx = createContext<{ size: TagSizeMm; setSize: (s: TagSizeMm) => void }>({ size: DEFAULT_TAG_SIZE_MM, setSize: () => {} });
function usePdf() {
  const { size } = useContext(SizeCtx);
  return (q: string) => `/api/tags/pdf?${q}&size=${size}`;
}

/** "Tag size: 2 cm · 2.5 cm · 3 cm" — applies to every Print / Reprint link. */
function SizePicker() {
  const { size, setSize } = useContext(SizeCtx);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate">
      <span>Tag size</span>
      <div className="inline-flex overflow-hidden rounded-full border border-ink/15" role="radiogroup" aria-label="Tag size">
        {TAG_SIZES_MM.map((mm) => (
          <button key={mm} type="button" role="radio" aria-checked={size === mm} onClick={() => setSize(mm)}
            className={`px-3 py-1.5 ${size === mm ? "bg-ink text-ivory" : "bg-white text-ink hover:bg-ink/5"}`}>
            {tagSizeLabel(mm)}
          </button>
        ))}
      </div>
      <span>{tagsPerPage(size).perPage} per A4 page</span>
    </div>
  );
}

/**
 * Tags: generate a batch of QR tags (PREFIX-NUMBER, e.g. FPL-0042), print it, and keep
 * the history. Any staff member can mark a tag missing/damaged and reprint
 * it; generating is for the business's main manager or an admin.
 */
type Props = {
  vendorId: string; vendorName: string; overview: TagOverview; canGenerate: boolean;
  /** A batch opened for detail, with its tags. */
  batch?: BatchRow | null; batchTags?: TagRow[];
  /** Page path, for links (keeps ?vendor= on the admin page). */
  basePath: string;
};

export function TagManager(props: Props) {
  const [size, setSizeState] = useState<TagSizeMm>(DEFAULT_TAG_SIZE_MM);
  useEffect(() => {
    try { const v = localStorage.getItem(SIZE_KEY); if (v) setSizeState(tagSizeFrom(v)); } catch { /* storage blocked */ }
  }, []);
  const setSize = (s: TagSizeMm) => {
    setSizeState(s);
    try { localStorage.setItem(SIZE_KEY, String(s)); } catch { /* storage blocked */ }
  };
  return <SizeCtx.Provider value={{ size, setSize }}><TagManagerInner {...props} /></SizeCtx.Provider>;
}

function TagManagerInner({ vendorId, vendorName, overview, canGenerate, batch, batchTags, basePath }: Props) {
  const pdf = usePdf();
  if (!overview.available) {
    return <p className="mt-6 rounded-card bg-warn/10 px-4 py-3 text-sm text-warn">Tag printing needs database migration 0036.</p>;
  }
  if (batch && batchTags) return <BatchDetail batch={batch} tags={batchTags} basePath={basePath} />;

  const t = overview.totals;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {([["Ready", t.free, "chip-ok"], ["On items", t.in_use, "chip-ink"], ["Missing", t.missing, "chip-warn"], ["Damaged", t.damaged, "chip-warn"]] as const)
          .map(([k, n, chip]) => (
            <div key={k} className="card p-4">
              <p className="text-xs text-slate">{k}</p>
              <p className="mt-1 font-display text-2xl text-ink">{n}</p>
              {(k === "Missing" || k === "Damaged") && n > 0 && <span className={`${chip} mt-1`}>Find it below to reprint</span>}
            </div>
          ))}
      </div>

      <TagSearch vendorId={vendorId} />

      {canGenerate && <Generator vendorId={vendorId} vendorName={vendorName} overview={overview} basePath={basePath} />}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-ink">Tag history</h2>
            <p className="mt-1 text-xs text-slate">Every batch you&apos;ve generated. Reprint a whole set, or just its missing and damaged tags.</p>
          </div>
          <SizePicker />
        </div>
        {overview.batches.length === 0 ? (
          <p className="mt-3 text-sm text-slate">No tags generated yet.</p>
        ) : (
          <div className="table-scroll mt-3 rounded-card border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-ink/5 text-left text-xs text-slate">
                <tr>
                  <th className="px-4 py-2.5">Generated</th><th className="px-4 py-2.5">Codes</th><th className="px-4 py-2.5">Qty</th>
                  <th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Printed</th><th className="px-4 py-2.5">Print</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {overview.batches.map((b) => {
                  const lost = b.counts.missing + b.counts.damaged;
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-3 text-slate">{d(b.created_at)}</td>
                      <td className="px-4 py-3">
                        <Link href={`${basePath}${basePath.includes("?") ? "&" : "?"}batch=${b.id}`} className="font-mono text-xs text-ink underline">
                          {b.firstCode}{b.quantity > 1 ? ` → ${b.lastCode?.split("-").pop()}` : ""}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink">{b.quantity}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(["in_use", "missing", "damaged"] as const).filter((k) => b.counts[k] > 0).map((k) => (
                            <span key={k} className={STATUS[k].chip}>{b.counts[k]} {STATUS[k].label.toLowerCase()}</span>
                          ))}
                          {b.counts.free > 0 && <span className="chip-ok">{b.counts.free} ready</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">{b.print_count ? `${b.print_count}× · ${d(b.last_printed_at)}` : "Not yet"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <a href={pdf(`batch=${b.id}`)} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-xs">
                            {b.print_count ? "Reprint set" : "Print"}
                          </a>
                          {lost > 0 && (
                            <a href={pdf(`batch=${b.id}&only=missing,damaged&reprint=1`)} target="_blank" rel="noopener noreferrer"
                              className="btn-ghost border-warn/40 px-3 py-1.5 text-xs text-warn">
                              Reprint {lost} missing/damaged
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Generator({ vendorId, vendorName, overview, basePath }: {
  vendorId: string; vendorName: string; overview: TagOverview; basePath: string;
}) {
  const [count, setCount] = useState("50");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ batchId: string; n: number } | null>(null);
  const pdf = usePdf();
  const n = Math.max(0, Math.min(500, Math.round(Number(count) || 0)));
  const code = (k: number) => `${overview.prefix}-${k < 10000 ? String(k).padStart(4, "0") : k}`;

  return (
    <section className="card p-5">
      <h2 className="font-display text-lg text-ink">Generate tags</h2>
      <p className="mt-1 text-xs text-slate">
        Each tag gets a QR code and a short code staff can type in: your prefix and a number, like{" "}
        <span className="font-mono text-ink">{code(42)}</span>. The prefix <span className="font-mono text-ink">{overview.prefix}</span> is
        set from the business name and belongs to {vendorName} alone, and numbers never repeat, so no two tags are ever the same.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="label" htmlFor="tag-count">How many</label>
          <input id="tag-count" className="field w-28" inputMode="numeric" value={count}
            onChange={(e) => { setCount(e.target.value.replace(/[^0-9]/g, "")); setMade(null); }} />
        </div>
        <button className="btn-primary" disabled={pending || n < 1}
          onClick={() => start(async () => {
            setErr(null);
            const r = await generateTagBatch(vendorId, n);
            if ("error" in r) setErr(r.error ?? "Couldn't generate tags.");
            else setMade({ batchId: r.batchId, n });
          })}>
          {pending ? "Generating…" : `Generate ${n || ""} tag${n === 1 ? "" : "s"}`}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate">
        {n > 0 ? <>Codes <span className="font-mono text-ink">{code(overview.nextSerial)}</span>
          {n > 1 && <> to <span className="font-mono text-ink">{code(overview.nextSerial + n - 1)}</span></>}. Up to 500 at a time.</> : "Enter how many tags to make (1–500)."}
      </p>
      <div className="mt-3"><SizePicker /></div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      {made && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-card bg-teal/10 px-4 py-3 text-sm">
          <span className="text-teal">{made.n} tags created.</span>
          <a href={pdf(`batch=${made.batchId}`)} target="_blank" rel="noopener noreferrer" className="btn-primary px-4 py-2 text-xs">Print them (PDF)</a>
          <Link href={`${basePath}${basePath.includes("?") ? "&" : "?"}batch=${made.batchId}`} className="text-xs text-ink underline">View the batch</Link>
        </div>
      )}
    </section>
  );
}

function BatchDetail({ batch, tags, basePath }: { batch: BatchRow; tags: TagRow[]; basePath: string }) {
  const [rows, setRows] = useState(tags);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "missing" | "damaged" | "in_use" | "free">("all");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const pdf = usePdf();
  const [codeQ, setCodeQ] = useState("");
  const shown = useMemo(() => {
    const q = codeQ.trim().toUpperCase();
    return rows.filter((r) => (filter === "all" || r.status === filter) && (!q || r.code.includes(q)));
  }, [rows, filter, codeQ]);
  const back = basePath;

  const mark = (id: string, status: "missing" | "damaged" | "found") => start(async () => {
    setErr(null);
    const r = await setTagStatus(id, status);
    if ("error" in r) { setErr(r.error ?? "Couldn't update the tag."); return; }
    setRows((rs) => rs.map((x) => x.id !== id ? x : {
      ...x, status: status === "found" ? (x.current_item_id ? "in_use" : "free") : status,
      status_note: status === "found" ? "Found" : null, status_changed_at: new Date().toISOString(),
    }));
  });

  return (
    <div className="space-y-4">
      <Link href={back} className="text-sm text-slate hover:text-ink">← Tag history</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">
            <span className="font-mono text-lg">{batch.firstCode}</span>{batch.quantity > 1 && <> → <span className="font-mono text-lg">{batch.lastCode?.split("-").pop()}</span></>}
          </h2>
          <p className="text-xs text-slate">{batch.quantity} tags · generated {d(batch.created_at)} · printed {batch.print_count}×</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={pdf(`batch=${batch.id}`)} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-2 text-xs">Reprint whole set</a>
          {selected.length > 0 && (
            <a href={pdf(`ids=${selected.join(",")}&reprint=1`)} target="_blank" rel="noopener noreferrer" className="btn-primary px-3 py-2 text-xs"
              onClick={() => setTimeout(() => setSelected([]), 500)}>
              Reprint {selected.length} selected
            </a>
          )}
        </div>
      </div>

      <SizePicker />
      <div className="flex flex-wrap items-center gap-2">
        <input className="field w-full sm:w-64" placeholder="Filter by code, e.g. 0042" value={codeQ}
          aria-label="Filter tags by code" onChange={(e) => setCodeQ(e.target.value)} />
        {(["all", "missing", "damaged", "in_use", "free"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? "chip-ink" : "chip-muted"}>
            {f === "all" ? `All (${rows.length})` : `${STATUS[f].label} (${rows.filter((r) => r.status === f).length})`}
          </button>
        ))}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}

      <div className="table-scroll rounded-card border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-left text-xs text-slate">
            <tr>
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox" aria-label="Select all shown"
                  checked={shown.length > 0 && shown.every((r) => selected.includes(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...shown.map((r) => r.id)])] : selected.filter((id) => !shown.some((r) => r.id === id)))} />
              </th>
              <th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Printed</th><th className="px-4 py-2.5">Mark / reprint</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5">
                  <input type="checkbox" aria-label={`Select ${r.code}`} checked={selected.includes(r.id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))} />
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink">{r.code}</td>
                <td className="px-4 py-2.5">
                  <span className={STATUS[r.status]?.chip ?? "chip-muted"}>{STATUS[r.status]?.label ?? r.status}</span>
                  {r.status_note && <span className="ml-2 text-xs text-slate">{r.status_note}</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate">{r.print_count}× · {d(r.last_printed_at)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {(r.status === "free" || r.status === "in_use") && (<>
                      <button className="btn-ghost px-2.5 py-1 text-xs" disabled={pending} onClick={() => mark(r.id, "missing")}>Missing</button>
                      <button className="btn-ghost px-2.5 py-1 text-xs" disabled={pending} onClick={() => mark(r.id, "damaged")}>Damaged</button>
                    </>)}
                    {(r.status === "missing" || r.status === "damaged") && (<>
                      <a href={pdf(`ids=${r.id}&reprint=1`)} target="_blank" rel="noopener noreferrer" className="btn-primary px-2.5 py-1 text-xs">Reprint</a>
                      {r.status === "missing" && <button className="btn-ghost px-2.5 py-1 text-xs" disabled={pending} onClick={() => mark(r.id, "found")}>Found it</button>}
                    </>)}
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate">No tags here.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate">Reprinting a missing or damaged tag prints the same code again and puts it back into use.</p>
    </div>
  );
}

type FoundTag = Extract<Awaited<ReturnType<typeof searchTags>>, { tags: unknown }>["tags"][number];

/** Type or scan a tag's code to find it and mark it missing / damaged, or reprint it. */
function TagSearch({ vendorId }: { vendorId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundTag[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const pdf = usePdf();

  const find = async (text: string) => {
    if (!text.trim()) { setResults(null); return; }
    setSearching(true); setErr(null);
    const r = await searchTags(vendorId, text);
    setSearching(false);
    if ("error" in r) setErr(r.error); else setResults(r.tags);
  };
  // Search as they type (short pause), and straight away on scan / Enter.
  useEffect(() => {
    const t = setTimeout(() => { void find(q); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const mark = (id: string, status: "missing" | "damaged" | "found") => start(async () => {
    setErr(null);
    const r = await setTagStatus(id, status);
    if ("error" in r) { setErr(r.error ?? "Couldn't update the tag."); return; }
    setResults((rs) => rs?.map((x) => x.id !== id ? x : {
      ...x, status: status === "found" ? (x.current_item_id ? "in_use" : "free") : status,
      status_note: status === "found" ? "Found" : null,
    }) ?? null);
  });

  return (
    <section className="card p-5">
      <h2 className="font-display text-lg text-ink">Find a tag</h2>
      <p className="mt-1 text-xs text-slate">Type or scan a tag’s code to mark it missing or damaged, or reprint it — no scrolling through batches.</p>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void find(q); }}>
        <input className="field min-w-0 flex-1 font-mono uppercase" placeholder="e.g. FPL-0042 or 42" value={q}
          aria-label="Tag code" inputMode="text" autoComplete="off"
          onChange={(e) => setQ(e.target.value.toUpperCase())} />
        <QrScanner label="Scan" onResult={(t) => { setQ(t.toUpperCase()); void find(t); }} />
        <button className="btn-primary px-4 py-2 text-sm" type="submit">Find</button>
      </form>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      {searching && <p className="mt-3 text-xs text-slate">Searching…</p>}
      {!searching && results && results.length === 0 && (
        <p className="mt-3 text-sm text-slate">No tag matches “{q}”.</p>
      )}
      {!searching && results && results.length > 0 && (
        <div className="table-scroll mt-3 rounded-card border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs text-slate">
              <tr><th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Printed</th><th className="px-4 py-2.5">Mark / reprint</th></tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {results.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink">{r.code}</td>
                  <td className="px-4 py-2.5">
                    <span className={STATUS[r.status]?.chip ?? "chip-muted"}>{STATUS[r.status]?.label ?? r.status}</span>
                    {r.status_note && <span className="ml-2 text-xs text-slate">{r.status_note}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate">{r.print_count ? `${r.print_count}× · ${d(r.last_printed_at)}` : "Not printed here"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {(r.status === "free" || r.status === "in_use") && (<>
                        <button className="btn-ghost px-2.5 py-1 text-xs" disabled={pending} onClick={() => mark(r.id, "missing")}>Missing</button>
                        <button className="btn-ghost px-2.5 py-1 text-xs" disabled={pending} onClick={() => mark(r.id, "damaged")}>Damaged</button>
                      </>)}
                      {(r.status === "missing" || r.status === "damaged") && (<>
                        <a href={pdf(`ids=${r.id}&reprint=1`)} target="_blank" rel="noopener noreferrer" className="btn-primary px-2.5 py-1 text-xs">Reprint</a>
                        {r.status === "missing" && <button className="btn-ghost px-2.5 py-1 text-xs" disabled={pending} onClick={() => mark(r.id, "found")}>Found it</button>}
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
