import Link from "next/link";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { ShellNav } from "./ShellNav";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/leakage", label: "Leakage" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/verification", label: "Verification" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/claims", label: "Claims" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/services", label: "Services & extras" },
  { href: "/admin/fees", label: "Fees & charges" },
  { href: "/admin/promos", label: "Promos" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/communications", label: "Communications" },
  { href: "/admin/integrations", label: "Integrations" },
];

const TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/analytics": "Analytics",
  "/admin/leakage": "Leakage analytics",
  "/admin/orders": "Orders",
  "/admin/vendors": "Vendors",
  "/admin/applications": "Vendor applications",
  "/admin/verification": "Verification",
  "/admin/users": "Users",
  "/admin/support": "Support",
  "/admin/claims": "Claims & lost items",
  "/admin/reviews": "Reviews",
  "/admin/services": "Services & extras",
  "/admin/fees": "Fees & charges",
  "/admin/promos": "Promo codes",
  "/admin/payouts": "Payouts",
  "/admin/communications": "Communications",
  "/admin/integrations": "Integrations",
};

export function AdminShell({
  children, active, name, role,
}: { children: React.ReactNode; active?: string; name: string; role: string }) {
  return (
    <div className="min-h-screen bg-ivory lg:flex">
      <ShellNav items={NAV} active={active} subtitle="Platform admin"
        account={<AccountBlock name={name} role={role} />} />

      <div className="flex-1">
        {/* Desktop header; on smaller screens the page title and account
            live in the top bar's menu instead. */}
        <header className="hidden items-center justify-between border-b border-ink/10 bg-white px-6 py-4 lg:flex">
          <p className="font-display text-lg text-ink">{TITLES[active ?? ""] ?? "Admin"}</p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate">{name} · {role.replace("_", " ")}</span>
            <Link href="/account/password" className="text-xs text-slate hover:text-ink">Password</Link>
            <SignOutButton />
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function AccountBlock({ name, role }: { name: string; role: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-xs text-ivory/60">{name} · {role.replace("_", " ")}</p>
      <div className="flex shrink-0 items-center gap-4">
        <Link href="/account/password" className="text-sm text-ivory/80 hover:text-ivory">Password</Link>
        <SignOutButton className="text-sm text-ivory/80 hover:text-ivory" />
      </div>
    </div>
  );
}
