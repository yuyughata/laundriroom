import { SignOutButton } from "@/components/ui/SignOutButton";

export default function NoVendor() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-6">
      <div className="card max-w-md p-8 text-center">
        <h1 className="font-display text-2xl text-ink">Not linked to a station yet</h1>
        <p className="mt-3 text-sm text-slate">
          Your account has a vendor role but isn&apos;t attached to a laundry station.
          Ask your manager or the platform admin to add you to the station, then sign in again.
        </p>
        <div className="mt-6"><SignOutButton className="btn-ghost w-full" /></div>
      </div>
    </main>
  );
}
