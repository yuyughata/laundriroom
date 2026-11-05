// Server-side: printable sheets of small garment tags (QR + typed code).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { BRAND_MARK_PNG_BASE64, BRAND_MARK_ASPECT } from "./brandMark";
import { scannableMask } from "./qrScannable";
import { PT_PER_MM, SHEET, tagSizeFrom, tagSizeLabel, tagsPerPage } from "./tagSizes";

export type PrintTag = { code: string };

const PAGE_W = SHEET.w;
const PAGE_H = SHEET.h;
const MARGIN = SHEET.margin;
const HEADER = SHEET.header;
const INK = rgb(0.06, 0.11, 0.18);
const SLATE = rgb(0.36, 0.4, 0.47);
const CUT = rgb(0.6, 0.63, 0.67);
const MIN_ONE_LINE_PT = 5.5; // below this the code wraps onto two lines

/**
 * A4 sheets of square tags (2, 2.5 or 3 cm), packed edge to edge so one cut
 * separates two tags. Each tag: dashed cut lines, a punch mark on its left
 * edge, the QR code (encodes the tag code; QR version 1 with ~25% damage
 * tolerance) and the code itself, as large as the tag allows, to type in.
 * Every page carries a 5 cm ruler to check it was printed at actual size.
 */
export async function buildTagSheetPdf(
  tags: PrintTag[],
  opts: { vendorName: string; title: string; sizeMm?: number },
): Promise<Uint8Array> {
  const sizeMm = tagSizeFrom(opts.sizeMm);
  const S = sizeMm * PT_PER_MM;
  const { cols, perPage } = tagsPerPage(sizeMm);

  const doc = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setAuthor("laundriroom");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  const mark = await doc.embedPng(Buffer.from(BRAND_MARK_PNG_BASE64, "base64"));

  // Tag geometry (all relative to the tag's bottom-left corner).
  const strip = S * 0.22;              // punch area on the left
  const pad = Math.max(S * 0.05, 2.5);
  const areaW = S - strip - pad;       // QR + code column
  const ringR = S * 0.06;

  // QR images, generated once per tag. Margin 2 modules: enough quiet zone
  // for phone scanners, since the tag's white space adds to it. Each code is
  // drawn with a mask the app's scanner is confirmed to read.
  const qrs = await Promise.all(tags.map((t) =>
    QRCode.toBuffer(t.code, {
      errorCorrectionLevel: "Q", maskPattern: scannableMask(t.code, "Q"),
      margin: 2, width: 300, color: { dark: "#0F1B2D", light: "#FFFFFF" },
    }).then((buf) => doc.embedPng(buf))));

  const gridW = cols * S;
  const gx = (PAGE_W - gridW) / 2;     // centre the grid across the page
  const gTop = PAGE_H - MARGIN - HEADER;
  const pages = Math.max(1, Math.ceil(tags.length / perPage));
  const vendor = opts.vendorName.length > 40 ? opts.vendorName.slice(0, 39) + "…" : opts.vendorName;

  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);

    // Header: brand, vendor, batch and page.
    const hy = PAGE_H - MARGIN - 11;
    page.drawImage(mark, { x: MARGIN, y: hy - 2, width: 12 * BRAND_MARK_ASPECT, height: 12 });
    const bx = MARGIN + 12 * BRAND_MARK_ASPECT + 4;
    page.drawText("laundriroom", { x: bx, y: hy, size: 9, font: bold, color: INK });
    page.drawText(vendor, { x: bx + bold.widthOfTextAtSize("laundriroom", 9) + 8, y: hy, size: 8, font, color: SLATE });
    const info = `${opts.title} · ${tagSizeLabel(sizeMm)} tags · page ${p + 1} of ${pages}`;
    page.drawText(info, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(info, 7.5), y: hy + 1, size: 7.5, font, color: SLATE });

    const slice = tags.slice(p * perPage, (p + 1) * perPage);
    slice.forEach((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gx + col * S;
      const y = gTop - (row + 1) * S;
      drawCutLines(page, x, y, S, {
        right: col === cols - 1 || i === slice.length - 1,
        bottom: i + cols >= slice.length,
      });
      drawTag(page, t.code, qrs[p * perPage + i], x, y, { S, strip, pad, areaW, ringR, mono });
    });

    drawFooter(page, font);
  }
  return doc.save();
}

/** Dashed cut lines. Neighbours share an edge, so each tag draws its top and
 *  left edges, plus right/bottom only where there's no neighbour. */
function drawCutLines(page: PDFPage, x: number, y: number, S: number, edge: { right: boolean; bottom: boolean }) {
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.4, color: CUT, dashArray: [2.2, 1.8] });
  line(x, y + S, x + S, y + S);
  line(x, y, x, y + S);
  if (edge.right) line(x + S, y, x + S, y + S);
  if (edge.bottom) line(x, y, x + S, y);
}

function drawTag(
  page: PDFPage, code: string, qr: Awaited<ReturnType<PDFDocument["embedPng"]>>, x: number, y: number,
  g: { S: number; strip: number; pad: number; areaW: number; ringR: number; mono: PDFFont },
) {
  const { S, strip, pad, areaW, ringR, mono } = g;

  // Punch mark: a small ring with a cross, centred in the left strip.
  const hx = x + strip * 0.55, hy = y + S / 2;
  page.drawCircle({ x: hx, y: hy, size: ringR, borderColor: INK, borderWidth: 0.6 });
  const c = ringR * 0.55;
  page.drawLine({ start: { x: hx - c, y: hy }, end: { x: hx + c, y: hy }, thickness: 0.35, color: INK });
  page.drawLine({ start: { x: hx, y: hy - c }, end: { x: hx, y: hy + c }, thickness: 0.35, color: INK });

  // The code: one line if it stays readable, else split after the prefix
  // ("FPL-" / "0042"); only needed for long prefixes on 2 cm tags.
  const cap = S * 0.115;
  let lines = [code];
  let size = Math.min(cap, (areaW - 1) / (mono.widthOfTextAtSize(code, 1)));
  if (size < MIN_ONE_LINE_PT) {
    const cut = code.lastIndexOf("-") + 1;
    lines = cut > 0 ? [code.slice(0, cut), code.slice(cut)] : [code];
    const widest = Math.max(...lines.map((l) => mono.widthOfTextAtSize(l, 1)));
    size = Math.min(cap, (areaW - 1) / widest);
  }
  const lineH = size * 1.05;
  const textH = lines.length * lineH;
  const gap = Math.max(1, S * 0.015);

  // QR as large as the space allows; QR + code centred vertically.
  const qs = Math.min(areaW, S - pad * 2 - textH - gap);
  const blockH = qs + gap + textH;
  const top = y + (S + blockH) / 2;
  const ax = x + strip;
  page.drawImage(qr, { x: ax + (areaW - qs) / 2, y: top - qs, width: qs, height: qs });

  lines.forEach((l, k) => {
    const w = mono.widthOfTextAtSize(l, size);
    // Courier's caps sit ~0.2em above the baseline's descender room.
    const baseline = top - qs - gap - (k + 1) * lineH + size * 0.22;
    page.drawText(l, { x: ax + (areaW - w) / 2, y: baseline, size, font: mono, color: INK });
  });
}

/** 5 cm ruler: if it doesn't measure 5 cm, the page was scaled when printed. */
function drawFooter(page: PDFPage, font: PDFFont) {
  const y = MARGIN + 6;
  const len = 50 * PT_PER_MM;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + len, y }, thickness: 0.6, color: INK });
  for (let cm = 0; cm <= 5; cm++) {
    const tx = MARGIN + cm * 10 * PT_PER_MM;
    page.drawLine({ start: { x: tx, y: y - 2 }, end: { x: tx, y: y + (cm % 5 === 0 ? 4 : 2.5) }, thickness: 0.5, color: INK });
  }
  page.drawText("5 cm — print at 100% / Actual size (not 'Fit to page'). If this line isn't 5 cm, the tags are the wrong size.",
    { x: MARGIN + len + 8, y: y - 2, size: 7, font, color: SLATE });
}
