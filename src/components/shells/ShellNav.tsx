"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";

export type NavItem = { href: string; label: string };

/**
 * Dashboard sidebar. On desktop (lg+) it's the fixed left column with every
 * link. Below that it collapses to a top bar with a Menu button that opens the
 * full link list plus the account block (name, Password, Sign out), so nothing
 * hides off-screen in a sideways strip.
 */
export function ShellNav({
  items, active, subtitle, account,
}: {
  items: NavItem[];
  active?: string;
  subtitle: string;
  /** Who's signed in + Password / Sign out, shown inside the phone menu. */
  account: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the phone menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  const current = items.find((n) => n.href === active)?.label;

  const link = (n: NavItem) => {
    const on = active === n.href;
    return (
      <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
        className={`rounded-card px-4 py-2.5 text-sm ${
          on ? "bg-ivory/15 text-ivory" : "text-ivory/70 hover:bg-ivory/10"}`}>
        {n.label}
      </Link>
    );
  };

  return (
    <aside className="shrink-0 bg-ink text-ivory lg:min-h-screen lg:w-60">
      <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block lg:py-5">
        <div className="min-w-0">
          <Logo variant="light" className="text-lg" />
          <p className="mt-1 truncate text-xs text-ivory/50">
            {subtitle}
            {current && <span className="lg:hidden"> · {current}</span>}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-controls="shell-menu"
          className="inline-flex shrink-0 items-center gap-2 rounded-pill border border-ivory/20 px-4 py-2 text-sm text-ivory lg:hidden">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {/* Phone / tablet: full menu, toggled */}
      {open && (
        <div id="shell-menu" className="border-t border-ivory/10 px-3 pb-4 pt-3 lg:hidden">
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3">{items.map(link)}</nav>
          <div className="mt-3 border-t border-ivory/10 px-4 pt-3">{account}</div>
        </div>
      )}

      {/* Desktop: always-visible column */}
      <nav className="hidden flex-col gap-0.5 px-3 lg:flex">{items.map(link)}</nav>
    </aside>
  );
}
