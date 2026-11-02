import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { ApplyForm } from "./ApplyForm";

export const metadata = { title: "Become a partner · laundriroom" };

export default function ApplyPage() {
  return (
    <main className="min-h-screen bg-ivory">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-10">
        <Link href="/"><Logo variant="dark" className="text-lg" /></Link>
        <div className="mt-10">
          <h1 className="font-display text-3xl text-ink">Partner with laundriroom</h1>
          <p className="mt-2 text-sm text-slate">
            Join the platform and get a steady stream of orders, tagging and
            tracking, payouts and reporting — all handled for you. Tell us about
            your laundry and we&apos;ll be in touch.
          </p>
          <div className="mt-6">
            <ApplyForm />
          </div>
        </div>
      </div>
    </main>
  );
}
