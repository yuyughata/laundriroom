import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { dateShort } from "@/lib/format";
import { LEGAL_DOCS, isLegalDoc, legalDocMeta, getLegalDoc } from "@/lib/legalDocs";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { doc: string } }): Metadata {
  if (!isLegalDoc(params.doc)) return { title: "laundriroom" };
  return { title: `${legalDocMeta(params.doc).title} · laundriroom` };
}

export default async function LegalPage({ params }: { params: { doc: string } }) {
  if (!isLegalDoc(params.doc)) notFound();
  const meta = legalDocMeta(params.doc);
  const { clauses, updatedAt } = await getLegalDoc(params.doc);
  const multi = clauses.length > 1;

  return (
    <main className="min-h-screen bg-ivory">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
        <Link href="/"><Logo variant="dark" className="text-lg" /></Link>

        <div className="mt-10">
          <h1 className="font-display text-3xl text-ink">{meta.title}</h1>
          <p className="mt-2 text-sm text-slate">{meta.intro}</p>
          {updatedAt && <p className="mt-1 text-xs text-slate">Last updated {dateShort(updatedAt)}</p>}

          <div className="mt-8 space-y-7">
            {clauses.map((c, i) => (
              <section key={c.id}>
                <h2 className="font-display text-lg text-ink">{multi ? `${i + 1}. ` : ""}{c.title}</h2>
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink/80">
                  {c.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
                </div>
              </section>
            ))}
          </div>

          <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink/10 pt-5 text-sm">
            {LEGAL_DOCS.filter((d) => d.slug !== meta.slug).map((d) => (
              <Link key={d.slug} href={`/legal/${d.slug}`} className="text-slate underline hover:text-ink">{d.footerLabel}</Link>
            ))}
            <Link href="/" className="text-slate underline hover:text-ink">Back to home</Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
