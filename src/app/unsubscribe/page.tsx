import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { UnsubscribeButton } from "./UnsubscribeButton";

export const metadata = { title: "Unsubscribe — laundriroom", robots: { index: false } };

/**
 * Unsubscribe from email broadcasts (link in every one). Asks for a click rather
 * than unsubscribing on page load, so email link-scanners can't do it by
 * accident. Email apps' one-click button uses POST /api/unsubscribe instead.
 */
export default function UnsubscribePage({ searchParams }: { searchParams: { t?: string } }) {
  const token = String(searchParams?.t ?? "");
  return (
    <main className="min-h-screen bg-ivory">
      <div className="mx-auto max-w-lg px-6 py-16">
        <Link href="/"><Logo className="text-xl" /></Link>
        <div className="card mt-10 p-8">
          {token ? (
            <UnsubscribeButton token={token} />
          ) : (
            <div>
              <h1 className="font-display text-3xl text-ink">Unsubscribe</h1>
              <p className="mt-3 text-slate">
                Use the unsubscribe link at the bottom of a laundriroom email, or turn these emails off in your{" "}
                <Link href="/customer/account" className="text-ink underline">account</Link>.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
