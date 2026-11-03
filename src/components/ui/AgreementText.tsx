import { paragraphCount, type AgreementClause } from "@/lib/legal";

/**
 * Renders the Partner Agreement clauses. Longer than three paragraphs, it
 * sits in a scrollable box so the form around it stays usable.
 */
export function AgreementText({ clauses, className = "" }: { clauses: AgreementClause[]; className?: string }) {
  const scroll = paragraphCount(clauses) > 3;
  const multi = clauses.length > 1;
  return (
    <div className={className}>
      <div
        className={scroll ? "max-h-64 overflow-y-auto overscroll-contain rounded-card border border-ink/10 bg-white/70 p-4 pr-3" : ""}
        tabIndex={scroll ? 0 : undefined}
        role={scroll ? "region" : undefined}
        aria-label={scroll ? "Partner Agreement text (scroll to read all of it)" : undefined}>
        <div className="space-y-4 text-xs leading-relaxed text-slate">
          {clauses.map((c, i) => (
            <section key={c.id}>
              {(multi || scroll) && (
                <p className="mb-1.5 text-xs font-semibold text-ink">{multi ? `${i + 1}. ` : ""}{c.title}</p>
              )}
              <div className="space-y-2">
                {c.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
      </div>
      {scroll && <p className="mt-1.5 text-[11px] text-slate">Scroll to read the whole agreement.</p>}
    </div>
  );
}
