"use client";

import { useEffect, useState } from "react";
import { qrWithLogo } from "@/lib/qrWithLogo";

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
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.setTitle(code ? `laundriroom promo ${code}` : `laundriroom — ${title}`);
    doc.setAuthor("laundriroom");
    const page = doc.addPage([595.28, 841.89]); // A4
    const W = page.getWidth(), H = page.getHeight();
    const ink = rgb(0x0f / 255, 0x1b / 255, 0x2d / 255), slate = rgb(0x5b / 255, 0x66 / 255, 0x78 / 255);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const mono = await doc.embedFont(StandardFonts.CourierBold);
    const centre = (text: string, font: typeof reg, size: number, y: number, color = ink) =>
      page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });

    // brand: mark + wordmark, centred
    try {
      const mark = await doc.embedPng(await (await fetch("/brand/mark-dark.png")).arrayBuffer());
      const mh = 26, mw = mh * (mark.width / mark.height), word = "laundriroom", ws = 24;
      const total = mw + 10 + bold.widthOfTextAtSize(word, ws);
      const x0 = (W - total) / 2, y0 = H - 92;
      page.drawImage(mark, { x: x0, y: y0, width: mw, height: mh });
      page.drawText(word, { x: x0 + mw + 10, y: y0 + 5, size: ws, font: bold, color: ink });
    } catch {
      centre("laundriroom", bold, 24, H - 87);
    }

    // the QR, 12 cm square
    const img = await doc.embedPng(await (await fetch(qr)).arrayBuffer());
    const size = 340;
    const qy = H - 140 - size;
    page.drawImage(img, { x: (W - size) / 2, y: qy, width: size, height: size });

    let y = qy - 56;
    if (code) { centre(code, mono, 46, y); y -= 40; }
    centre(code ? "Scan to order on laundriroom" : "Scan to open laundriroom", reg, 18, y, slate);
    y -= 26;
    if (code) { centre("or enter the code when you order", reg, 12, y, slate); y -= 20; }

    // the link, small, wrapped if long
    const words = url.length > 70 ? [url.slice(0, 70), url.slice(70)] : [url];
    let ly = 70 + (words.length - 1) * 13;
    for (const line of words) { centre(line, reg, 10, ly, slate); ly -= 13; }

    const bytes = await doc.save();
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
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
