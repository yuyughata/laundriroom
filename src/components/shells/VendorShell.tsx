import Link from "next/link";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { ShellNav } from "./ShellNav";

// managerOnly: shown to the business's main manager only.
const NAV = [
  { href: "/vendor/queue", label: "Queue" },
  { href: "/vendor/tags", label: "Tags" },
  { href: "/vendor/riders", label: "Riders" },
  { href: "/vendor/profile", label: "My page" },
  { href: "/vendor/branches", label: "Branches" },
  { href: "/vendor/requests", label: "Item requests" },
  { href: "/vendor/reviews", label: "Reviews" },
  { href: "/vendor/promos", label: "Promos" },
  { href: "/vendor/team", label: "Team", managerOnly: true },
  { href: "/vendor/ledger", label: "Ledger", managerOnly: true },
  { href: "/vendor/verification", label: "Verification" },
];

export function VendorShell({
  children, active, vendorName, staffName, staffRole, branchName, isManager = false,
}: {
  children: React.ReactNode; active?: string;
  vendorName: string; staffName: string; staffRole: string;
  /** Set when the staff member works at one branch. */
  branchName?: string | null;
  /** Business-wide manager: sees Team and Ledger. */
  isManager?: boolean;
}) {
  const items = NAV.filter((n) => isManager || !n.managerOnly).map(({ href, label }) => ({ href, label }));
  return (
    <div className="min-h-screen bg-ivory lg:flex">
      <ShellNav items={items} active={active} subtitle="Vendor station"
        account={
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-ivory/60">{staffName} · {staffRole}</p>
            <div className="flex shrink-0 items-center gap-4">
              <Link href="/account/password" className="text-sm text-ivory/80 hover:text-ivory">Password</Link>
              <SignOutButton className="text-sm text-ivory/80 hover:text-ivory" />
            </div>
          </div>
        } />

      <div className="flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-ink/10 bg-white px-4 py-3 sm:px-6 lg:py-4">
          <div>
            <p className="font-display text-lg text-ink">{vendorName}</p>
            <p className="text-xs text-slate">{staffName} · {staffRole}{branchName ? ` · ${branchName}` : ""}</p>
          </div>
          <div className="hidden items-center gap-4 lg:flex">
            <Link href="/account/password" className="text-xs text-slate hover:text-ink">Password</Link>
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto max-w-tablet px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
