"use client";

import { useEffect, useState } from "react";
import { qrWithLogo } from "@/lib/qrWithLogo";
import { downloadQrPdf } from "@/lib/qrPdf";

const INK = "#0F1B2D";

/**
 * A QR code for a link, with copy-link and a print-ready PNG download. For a
 * promo, `code` is printed big under the QR so people can also type it in.
 */
export function QrCard({ title, url, code, note, fileName, compact = false }: {
  title: string; url: string; code?: string; note?: string; fileName: string; compact?: boolean;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    qrWithLogo(url, 720).then(setQr).catch(() => setQr(null));
  }, [url]);

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copy the link", url); }
  }

  /** QR + code + a line of text on a white card, for flyers and counters. */
  async function download() {
    if (!qr) return;
    const img = new Image();
    img.src = qr;
    await img.decode();
    await document.fonts?.ready;
    const W = 900, pad = 90, qrSize = W - pad * 2;
    const H = pad + qrSize + (code ? 210 : 120);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, W, H);
    g.drawImage(img, pad, pad * 0.6, qrSize, qrSize);
    g.fillStyle = INK; g.textAlign = "center";
    let y = pad * 0.6 + qrSize + 70;
    if (code) {
      g.font = "700 76px 'Courier New', monospace";
      g.fillText(code, W / 2, y);
      y += 70;
    }
    g.font = "500 34px Inter, Arial, sans-serif";
    g.fillStyle = "#5B6678";
    g.fillText(code ? "Scan to order on laundriroom" : "Scan to open laundriroom", W / 2, y);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${fileName}.png`;
    a.click();
  }

  /** An A4 page to print: logo, a 12 cm QR (with the logo), the code and the link. */
  async function downloadPdf() {
    if (!qr) return;
    await downloadQrPdf({
      qrDataUrl: qr, url, fileName,
      docTitle: code ? `laundriroom promo ${code}` : `laundriroom — ${title}`,
      big: code, bigMono: true,
      caption: code ? "Scan to order on laundriroom" : "Scan to open laundriroom",
      note: code ? "or enter the code when you order" : undefined,
    });
  }

  return (
    <div className={`card flex ${compact ? "flex-col items-center gap-3 sm:flex-row sm:items-start" : "flex-col items-center gap-3 sm:flex-row"} p-4`}>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={`QR code for ${url}`} width={compact ? 132 : 156} height={compact ? 132 : 156}
          className="shrink-0 rounded-lg border border-ink/10" />
      ) : (
        <div className={`${compact ? "h-[132px] w-[132px]" : "h-[156px] w-[156px]"} shrink-0 animate-pulse rounded-lg bg-ink/5`} />
      )}
      <div className="min-w-0 flex-1 text-center sm:text-left">
        <p className="font-medium text-ink">{title}</p>
        {code && <p className="mt-1 font-mono text-lg tracking-widest text-ink">{code}</p>}
        <p className="mt-1 break-all text-xs text-slate">{url}</p>
        {note && <p className="mt-1 text-xs text-slate">{note}</p>}
        <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
          <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={!qr} onClick={download}>Download QR (PNG)</button>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={!qr} onClick={downloadPdf}>Download PDF</button>
        </div>
      </div>
    </div>
  );
}
