"use client";

import { useEffect, useState } from "react";

/**
 * A floating "Install the app" prompt that stays on screen until the visitor
 * installs the PWA (or is already running it as an installed app).
 *
 * - Chrome / Edge / Android / Samsung Internet: captures the `beforeinstallprompt`
 *   event and shows an Install button that opens the native install dialog.
 * - iOS Safari (no `beforeinstallprompt`): shows the manual "Add to Home Screen"
 *   steps, since that's the only way to install on iOS.
 * - Hides itself when the app is already installed (standalone display mode or
 *   iOS `navigator.standalone`), and after a successful install.
 *
 * It deliberately has no permanent "dismiss" — the most it does is collapse to a
 * small pill (a per-device convenience), so the invitation keeps floating until
 * the app is actually installed. The collapsed preference is the only thing kept
 * in localStorage, and reads/writes are guarded so private mode can't break it.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const COLLAPSE_KEY = "lr_install_collapsed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as Mac, but it's a touch device
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const webkit = /WebKit/i.test(ua);
  // Exclude Chrome/Firefox/Edge on iOS (they can't install either, but they
  // show their own chrome and the Share-sheet steps don't apply the same way).
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return iOS && webkit && !otherBrowser;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true); // assume hidden until we know
  const [collapsed, setCollapsed] = useState(false);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstalled(isStandalone());
    setIos(isIosSafari());
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch { /* private mode — default expanded */ }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop the mini-infobar; we drive our own UI
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    const mq = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayChange = () => setInstalled(isStandalone());

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    mq?.addEventListener?.("change", onDisplayChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mq?.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  // Nothing to show: already installed, or no install path on this browser.
  if (installed) return null;
  if (!ios && !deferred) return null;

  function setCollapsedPersisted(v: boolean) {
    setCollapsed(v);
    try { window.localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      // The event can only be used once. If accepted, `appinstalled` hides us.
      // If dismissed, drop it; a fresh beforeinstallprompt re-arms on the next
      // navigation, so the invitation keeps floating.
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
    } catch { /* ignore */ }
  }

  const wrap =
    "fixed inset-x-0 z-50 flex justify-center px-4 " +
    "bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] sm:bottom-6";

  // Collapsed: a small floating pill that still invites installation.
  if (collapsed) {
    return (
      <div className={wrap}>
        <button
          type="button"
          onClick={() => setCollapsedPersisted(false)}
          className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ivory shadow-lg shadow-ink/25"
          aria-label="Install the laundriroom app"
        >
          <img src="/brand/mark-light.png" alt="" className="h-4 w-4" />
          Install app
        </button>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-4 shadow-xl shadow-ink/20">
        <div className="flex items-start gap-3">
          <img src="/brand/mark-dark.png" alt="" className="mt-0.5 h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Install the laundriroom app</p>
            <p className="mt-0.5 text-xs text-slate">
              Add it to your home screen for faster booking and live order tracking.
            </p>

            {ios && !deferred ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setIosHelpOpen((v) => !v)}
                  className="btn-accent w-full px-4 py-2 text-sm"
                  aria-expanded={iosHelpOpen}
                >
                  How to install
                </button>
                {iosHelpOpen && (
                  <ol className="mt-3 space-y-1.5 text-xs text-slate">
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink/10 text-[10px] text-ink">1</span>
                      Tap the Share icon
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-ink">
                        <path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                      </svg>
                      in the toolbar.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink/10 text-[10px] text-ink">2</span>
                      Choose <span className="font-medium text-ink">Add to Home Screen</span>.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink/10 text-[10px] text-ink">3</span>
                      Tap <span className="font-medium text-ink">Add</span> — you&apos;re done.
                    </li>
                  </ol>
                )}
              </div>
            ) : (
              <button type="button" onClick={install} className="btn-accent mt-3 w-full px-4 py-2 text-sm">
                Install
              </button>
            )}
          </div>

          {/* Minimise — collapses to a floating pill; it never fully dismisses. */}
          <button
            type="button"
            onClick={() => setCollapsedPersisted(true)}
            className="-m-1 shrink-0 rounded-full p-1 text-slate hover:text-ink"
            aria-label="Minimise install prompt"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
