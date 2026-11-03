// Server-side: printable sheets of garment tags (QR + typed code).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { BRAND_MARK_PNG_BASE64, BRAND_MARK_ASPECT } from "./brandMark";

export type PrintTag = { code: string };

const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 28;
const HEADER = 22;
const COLS = 3;
const ROWS = 5;
const INK = rgb(0.06, 0.11, 0.18);
const SLATE = rgb(0.36, 0.4, 0.47);
const CUT = rgb(0.55, 0.58, 0.62);

/**
 * A4 sheets of tags in a 3 × 5 grid. Each tag has dashed cut lines around it,
 * a punch-hole mark on its left edge (for the safety pin / tie), the QR code
 * (which encodes the tag code), and the code printed large enough to type in.
 */
export async function buildTagSheetPdf(tags: PrintTag[], opts: { vendorName: string; title: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setAuthor("laundriroom");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  const mark = await doc.embedPng(Buffer.from(BRAND_MARK_PNG_BASE64, "base64"));

  const cellW = (PAGE_W - MARGIN * 2) / COLS;
  const cellH = (PAGE_H - MARGIN * 2 - HEADER) / ROWS;
  const perPage = COLS * ROWS;
  const pages = Math.max(1, Math.ceil(tags.length / perPage));

  // QR images, generated once per tag.
  const qrs = await Promise.all(tags.map((t) =>
    QRCode.toBuffer(t.code, { errorCorrectionLevel: "M", margin: 2, width: 360, color: { dark: "#0F1B2D", light: "#FFFFFF" } })
      .then((buf) => doc.embedPng(buf))));

  const vendor = opts.vendorName.length > 34 ? opts.vendorName.slice(0, 33) + "…" : opts.vendorName;

  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    // Header line.
    const hy = PAGE_H - MARGIN - 12;
    page.drawImage(mark, { x: MARGIN, y: hy - 2, width: 14 * BRAND_MARK_ASPECT, height: 14 });
    page.drawText("laundriroom", { x: MARGIN + 14 * BRAND_MARK_ASPECT + 5, y: hy, size: 10, font: bold, color: INK });
    const info = `${opts.title} · page ${p + 1} of ${pages} · cut along the dashed lines, punch the ring`;
    page.drawText(info, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(info, 7.5), y: hy + 1, size: 7.5, font, color: SLATE });

    const slice = tags.slice(p * perPage, (p + 1) * perPage);
    slice.forEach((t, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * cellW;
      const y = PAGE_H - MARGIN - HEADER - (row + 1) * cellH;

      // Cut lines (dashed box) and small corner ticks.
      page.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: CUT, borderWidth: 0.6, borderDashArray: [4, 3] });

      // Punch hole on the left edge: a ring with a cross.
      const hx = x + 16, hyc = y + cellH / 2;
      page.drawCircle({ x: hx, y: hyc, size: 6, borderColor: INK, borderWidth: 0.8 });
      page.drawLine({ start: { x: hx - 3, y: hyc }, end: { x: hx + 3, y: hyc }, thickness: 0.5, color: INK });
      page.drawLine({ start: { x: hx, y: hyc - 3 }, end: { x: hx, y: hyc + 3 }, thickness: 0.5, color: INK });

      // QR, centred in the area right of the hole.
      const qrSize = Math.min(cellH - 52, cellW - 52);
      const areaX = x + 30, areaW = cellW - 36;
      const qx = areaX + (areaW - qrSize) / 2;
      const qy = y + cellH - 10 - qrSize;
      page.drawImage(qrs[p * perPage + i], { x: qx, y: qy, width: qrSize, height: qrSize });

      // The code, large and monospaced so staff can type it in.
      let size = 12;
      while (mono.widthOfTextAtSize(t.code, size) > areaW - 4 && size > 7) size -= 0.5;
      const cw = mono.widthOfTextAtSize(t.code, size);
      page.drawText(t.code, { x: areaX + (areaW - cw) / 2, y: qy - 16, size, font: mono, color: INK });

      // Vendor name, small.
      const vw = font.widthOfTextAtSize(vendor, 6.5);
      page.drawText(vendor, { x: areaX + (areaW - vw) / 2, y: qy - 27, size: 6.5, font, color: SLATE });
    });
  }
  return doc.save();
}
