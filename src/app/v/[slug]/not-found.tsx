import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function VendorNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-6">
      <div className="max-w-sm text-center">
        <Link href="/" aria-label="laundriroom home"><Logo className="text-xl" /></Link>
        <h1 className="mt-8 font-display text-2xl text-ink">We couldn&apos;t find that laundry</h1>
        <p className="mt-2 text-sm text-slate">
          The link may be mistyped, or the laundry isn&apos;t taking orders on laundriroom right now.
        </p>
        <Link href="/signup" className="btn-primary mt-6">Find a laundry on laundriroom</Link>
      </div>
    </main>
  );
}
