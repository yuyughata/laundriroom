import Link from "next/link";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { Logo } from "@/components/ui/Logo";

const NAV = [
  { href: "/vendor/queue", label: "Queue" },
  { href: "/vendor/requests", label: "Item requests" },
  { href: "/vendor/reviews", label: "Reviews" },
  { href: "/vendor/promos", label: "Promos" },
  { href: "/vendor/ledger", label: "Ledger" },
  { href: "/vendor/verification", label: "Verification" },
];

export function VendorShell({
  children, active, vendorName, staffName, staffRole,
}: {
  children: React.ReactNode; active?: string;
  vendorName: string; staffName: string; staffRole: string;
}) {
  return (
    <div className="min-h-screen bg-ivory lg:flex">
      <aside className="shrink-0 border-b border-ink/10 bg-ink text-ivory lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <Logo variant="light" className="text-lg" />
          <p className="mt-1 text-xs text-ivory/50">Vendor station</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-0.5 lg:pb-0">
          {NAV.map((n) => {
            const on = active === n.href;
            return (
              <Link key={n.href} href={n.href}
                className={`whitespace-nowrap rounded-card px-4 py-2.5 text-sm ${
                  on ? "bg-ivory/15 text-ivory" : "text-ivory/70 hover:bg-ivory/10"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4">
          <div>
            <p className="font-display text-lg text-ink">{vendorName}</p>
            <p className="text-xs text-slate">{staffName} · {staffRole}</p>
          </div>
          <SignOutButton />
        </header>
        <main className="mx-auto max-w-tablet px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
