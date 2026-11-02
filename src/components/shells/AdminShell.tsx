import Link from "next/link";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { Logo } from "@/components/ui/Logo";

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
      <aside className="shrink-0 bg-ink text-ivory lg:min-h-screen lg:w-60">
        <div className="px-5 py-5">
          <Logo variant="light" className="text-lg" />
          <p className="mt-1 text-xs text-ivory/50">Platform admin</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-0.5 lg:pb-0">
          {NAV.map((n) => {
            const on = n.exact ? active === n.href : active === n.href;
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
          <p className="font-display text-lg text-ink">{TITLES[active ?? ""] ?? "Admin"}</p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate">{name} · {role.replace("_", " ")}</span>
            <Link href="/account/password" className="text-xs text-slate hover:text-ink">Password</Link>
            <SignOutButton />
          </div>
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
