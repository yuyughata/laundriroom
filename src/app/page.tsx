import Link from "next/link";
import { getProfile, homeFor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

export default async function Landing() {
  const profile = await getProfile();
  if (profile) redirect(homeFor(profile.role));

  return (
    <main className="min-h-screen bg-ink text-ivory">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <Logo variant="light" className="text-2xl" />

        <div className="mt-24 max-w-2xl">
          <h1 className="font-display text-5xl leading-tight sm:text-6xl">
            Laundry, handled.
          </h1>
          <p className="mt-6 text-lg text-ivory/70">
            Get your laundry picked up and delivered from any part of the city —
            even without a laundriroom station nearby. Track every item, pay in
            the app, and have it brought back pressed and folded.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-accent">Create an account</Link>
            <Link href="/login" className="btn-ghost border-ivory/25 text-ivory hover:bg-ivory/10">
              Sign in
            </Link>
          </div>

          <p className="mt-10 text-sm text-ivory/50">
            Vendor or admin? Sign in with the account your team set up, or{" "}
            <Link href="/apply" className="text-champagne underline">apply to become a partner</Link>.
          </p>
        </div>

        <div className="mt-28 grid gap-6 sm:grid-cols-3">
          {[
            ["Anywhere in the city", "Picked up and delivered from any part of the city — even without a laundriroom station nearby."],
            ["Track every item", "Each garment gets its own tag and sub-ID you can follow."],
            ["Pay your way", "Online before delivery, or tap Pay now at the door."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-card border border-ivory/10 bg-ink-soft/40 p-5">
              <h3 className="font-display text-lg text-ivory">{t}</h3>
              <p className="mt-2 text-sm text-ivory/60">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
