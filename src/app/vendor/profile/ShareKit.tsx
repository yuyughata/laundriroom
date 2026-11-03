"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Everything a vendor needs to hand their profile link to customers: copy,
 * WhatsApp, the phone's share sheet, and a QR code to print for the counter.
 */
export function ShareKit({ url, vendorName }: { url: string; vendorName: string }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  const message = `Order your laundry from ${vendorName} on laundriroom — book a pickup or drop-off, track every item and pay in the app: ${url}`;

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
    QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: "#0F1B2D", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your link", url);
    }
  }

  async function share() {
    try { await navigator.share({ url, title: vendorName, text: message.replace(`: ${url}`, "") }); } catch { /* dismissed */ }
  }

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_auto]">
      <div className="card p-5">
        <p className="label">Your link</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
            className="field font-medium text-ink" aria-label="Your profile link" />
          <button type="button" onClick={copy} className="btn-primary shrink-0">
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
            className="btn-ghost px-4 py-2 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3a.4.4 0 000-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.2-1.2c-.1-.1-.3-.2-.5-.3z" />
            </svg>
            Share on WhatsApp
          </a>
          {canShare && (
            <button type="button" onClick={share} className="btn-ghost px-4 py-2 text-sm">More ways to share</button>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-ghost px-4 py-2 text-sm">View my page</a>
        </div>

        <p className="mt-4 text-xs text-slate">
          Put it in your WhatsApp status and business profile, Instagram bio, or send it to customers who call to book.
          Anyone who opens it can order from you directly — new customers create an account in a minute.
        </p>
      </div>

      <div className="card flex flex-col items-center p-5 text-center">
        <p className="label">QR code for your counter</p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR code for ${url}`} width={176} height={176} className="rounded-card border border-ink/10" />
        ) : (
          <div className="h-44 w-44 animate-pulse rounded-card bg-ink/5" />
        )}
        <p className="mt-2 max-w-[11rem] text-xs text-slate">Customers scan it with their phone camera to open your page.</p>
        {qr && (
          <a href={qr} download={`laundriroom-${vendorName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr.png`}
            className="btn-ghost mt-3 px-4 py-2 text-sm">Download QR</a>
        )}
      </div>
    </div>
  );
}
