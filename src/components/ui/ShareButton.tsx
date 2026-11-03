"use client";

import { useState } from "react";

/**
 * Share a link: the phone's share sheet where there is one (WhatsApp,
 * Instagram, SMS…), otherwise copy to the clipboard.
 */
export function ShareButton({
  url, title, text, className = "", label = "Share",
}: { url: string; title: string; text?: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url, title, text });
        return;
      }
    } catch {
      return; // share sheet dismissed
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <button type="button" onClick={share} className={className}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" />
      </svg>
      {copied ? "Link copied" : label}
    </button>
  );
}
