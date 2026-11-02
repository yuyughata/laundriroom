import Link from "next/link";

const NAV = [
  { href: "/customer", label: "Home", icon: "M3 11l9-8 9 8M5 10v10h14V10" },
  { href: "/customer/order", label: "Order", icon: "M12 5v14M5 12h14" },
  { href: "/customer/support", label: "Support", icon: "M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z" },
  { href: "/customer/account", label: "Account", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0" },
];

export function CustomerShell({ children, active }: { children: React.ReactNode; active?: string }) {
  return (
    <div className="min-h-screen bg-ivory">
      <div className="mx-auto max-w-phone px-5 pb-28 pt-6">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-ink/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-phone items-center justify-around px-6 py-3">
          {NAV.map((n) => {
            const on = active === n.href;
            return (
              <Link key={n.href} href={n.href}
                className={`flex flex-col items-center gap-1 text-xs ${on ? "text-ink" : "text-slate"}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={n.icon} />
                </svg>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
