"use client";

import { useMemo, useState } from "react";
import { money, SERVICE_LABEL } from "@/lib/format";
import type { ServiceType } from "@/lib/database.types";

type Row = [string, Partial<Record<ServiceType, number>>];

const FIRST = 12;

/**
 * Public price list with a responsive search box — lets a customer find an item
 * among 100+ without scrolling the whole list. Server passes every row; this
 * filters client-side by item name.
 */
export function PriceList({ rows, services }: { rows: Row[]; services: ServiceType[] }) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? rows.filter(([name]) => name.toLowerCase().includes(query)) : rows),
    [rows, query],
  );
  const searching = query.length > 0;
  const visible = searching || showAll ? filtered : filtered.slice(0, FIRST);

  return (
    <div className="mt-3">
      <div className="relative">
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate">
          <path fill="currentColor" d="M8.5 3a5.5 5.5 0 014.23 9.02l3.12 3.13a.75.75 0 01-1.06 1.06l-3.13-3.12A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items — e.g. shirt, agbada, duvet"
          aria-label="Search items"
          className="w-full rounded-pill border border-ink/15 bg-white py-2.5 pl-9 pr-9 text-sm text-ink outline-none transition focus:border-ink/40 focus:ring-2 focus:ring-champagne/40"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink">
            <svg viewBox="0 0 20 20" className="h-4 w-4"><path fill="currentColor" d="M10 8.94l3.53-3.53 1.06 1.06L11.06 10l3.53 3.53-1.06 1.06L10 11.06l-3.53 3.53-1.06-1.06L8.94 10 5.41 6.47l1.06-1.06L10 8.94z" /></svg>
          </button>
        )}
      </div>

      {searching && (
        <p className="mt-2 text-xs text-slate">
          {filtered.length === 0 ? "No items match your search." : `${filtered.length} item${filtered.length === 1 ? "" : "s"} found`}
        </p>
      )}

      {visible.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              {services.map((s) => <col key={s} className="w-[4.6rem] sm:w-28" />)}
            </colgroup>
            <thead>
              <tr className="text-left text-xs text-slate">
                <th className="py-2 pr-2 font-medium">Item</th>
                {services.map((s) => <th key={s} className="py-2 pl-2 text-right font-medium">{SERVICE_LABEL[s]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {visible.map(([item, r]) => (
                <tr key={item}>
                  <td className="py-2.5 pr-2 text-ink">{item}</td>
                  {services.map((s) => (
                    <td key={s} className="whitespace-nowrap py-2.5 pl-2 text-right text-ink">
                      {r[s] != null ? money(r[s]!) : <span className="text-slate">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!searching && filtered.length > FIRST && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm font-medium text-ink underline">
          {showAll ? "Show fewer" : `Show all ${filtered.length} items`}
        </button>
      )}
    </div>
  );
}
