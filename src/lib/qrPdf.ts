/**
 * A print-ready A4 page for a QR code: laundriroom logo at the top, the QR
 * 12 cm square, then a big line (a promo code, or a laundry's name), a caption
 * and the link in small print. Made in the browser with pdf-lib and downloaded.
 */
/**
 * pdf-lib's built-in fonts only cover Western European letters. Turn other
 * characters into their closest plain form ("Ọlá" → "Olá", "₦" → "N") so a
 * name never stops the PDF being made.
 */
export function pdfSafe(text: string): string {
  return String(text ?? "")
    .replace(/₦/g, "N")
    .normalize("NFC")
    .replace(/[\u0300-\u036f]/g, "")                                         // leftover stacked accents
    .replace(/\s+/g, " ")
    .replace(/[\s\S]/gu, (ch) => {
      const code = ch.codePointAt(0)!;
      if (code < 0x100 || "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".includes(ch)) return ch;   // WinAnsi: draw as is
      const plain = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");       // Ọ → O, ẹ → e
      return plain.length === 1 && plain.charCodeAt(0) < 0x100 ? plain : "";    // emoji and the like: left out
    })
    .replace(/ {2,}/g, " ")
    .trim();
}

export async function downloadQrPdf(opts: {
  qrDataUrl: string;      // PNG data URL (with the logo, from qrWithLogo)
  url: string;            // printed small at the bottom
  fileName: string;       // without .pdf
  docTitle: string;
  big?: string;           // e.g. the promo code or the laundry's name
  bigMono?: boolean;      // codes in Courier, names in Helvetica
  caption: string;        // "Scan to order on laundriroom"
  note?: string;          // a smaller line under the caption
}) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  opts = { ...opts, big: opts.big ? pdfSafe(opts.big) : opts.big, caption: pdfSafe(opts.caption),
    note: opts.note ? pdfSafe(opts.note) : opts.note, url: pdfSafe(opts.url) };
  const doc = await PDFDocument.create();
  doc.setTitle(opts.docTitle);
  doc.setAuthor("laundriroom");
  const page = doc.addPage([595.28, 841.89]); // A4
  const W = page.getWidth(), H = page.getHeight();
  const ink = rgb(0x0f / 255, 0x1b / 255, 0x2d / 255), slate = rgb(0x5b / 255, 0x66 / 255, 0x78 / 255);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  type Font = typeof reg;
  const centre = (text: string, font: Font, size: number, y: number, color = ink) =>
    page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  // shrink a line until it fits the page width
  const fit = (text: string, font: Font, size: number, max = W - 96) => {
    let s = size;
    while (s > 14 && font.widthOfTextAtSize(text, s) > max) s -= 2;
    return s;
  };

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
  const img = await doc.embedPng(await (await fetch(opts.qrDataUrl)).arrayBuffer());
  const size = 340;
  const qy = H - 140 - size;
  page.drawImage(img, { x: (W - size) / 2, y: qy, width: size, height: size });

  let y = qy - 56;
  if (opts.big) {
    const font = opts.bigMono ? mono : bold;
    const s = fit(opts.big, font, opts.bigMono ? 46 : 36);
    centre(opts.big, font, s, y);
    y -= 40;
  }
  centre(opts.caption, reg, fit(opts.caption, reg, 18), y, slate);
  y -= 26;
  if (opts.note) centre(opts.note, reg, fit(opts.note, reg, 12), y, slate);

  // the link, small, wrapped if long
  const lines = opts.url.length > 70 ? [opts.url.slice(0, 70), opts.url.slice(70)] : [opts.url];
  let ly = 70 + (lines.length - 1) * 13;
  for (const line of lines) { centre(line, reg, 10, ly, slate); ly -= 13; }

  const bytes = await doc.save();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  a.download = `${opts.fileName}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
