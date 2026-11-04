"use client";

import { useEffect, useState } from "react";
import { renderNewsletter } from "@/lib/newsletter";
import type { Newsletter } from "@/lib/database.types";

export function SentPreview({ n }: { n: Newsletter }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const html = renderNewsletter({
    subject: n.subject, preheader: n.preheader, headerImageUrl: n.header_image_url, footerImageUrl: n.footer_image_url,
    bodyHtml: n.body_html, ctaLabel: n.cta_label, ctaUrl: n.cta_url,
  }, { iconUrl: `${origin}/brand/mark-email.png`, unsubscribeUrl: "#" });
  return (
    <div className="flex justify-center rounded-card border border-ink/10 bg-ivory-deep p-3">
      <iframe title="Email as sent" sandbox="" srcDoc={html} className="h-[760px] w-[600px] max-w-full rounded-lg bg-white" />
    </div>
  );
}
