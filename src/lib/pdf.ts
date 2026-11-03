import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { BRAND_MARK_PNG_BASE64, BRAND_MARK_ASPECT } from "./brandMark";

/**
 * Lightweight PDF report builder (pdf-lib — pure JS, no headless browser).
 * Renders a titled, paginated table in A4 landscape. Used by the role-scoped
 * report routes under /api/reports.
 */

export type Column = { header: string; width: number; align?: "left" | "right" };

export type ReportInput = {
  title: string;
  meta: string[];           // e.g. ["Scope: all vendors", "Generated 1 Nov 2026"]
  columns: Column[];
  rows: string[][];
  totalsRow?: string[];     // optional emphasised final row
};

const INK = rgb(0.06, 0.11, 0.18);
const SLATE = rgb(0.36, 0.4, 0.47);
const LINE = rgb(0.85, 0.85, 0.85);

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 40;

/** Replace characters the standard (WinAnsi) fonts can't encode. */
export function pdfSafe(s: string): string {
  return (s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₦/g, "NGN ")
    .replace(/[^\x00-\xFF]/g, "?");
}

/** Money formatted for PDF (no ₦ glyph, which Helvetica can't encode). */
export function pdfMoney(n: number | null | undefined): string {
  return "NGN " + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));
}

function truncate(s: string, font: PDFFont, size: number, maxW: number): string {
  const t = pdfSafe(s);
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  let cut = t;
  while (cut.length > 1 && font.widthOfTextAtSize(cut + "..", size) > maxW) {
    cut = cut.slice(0, -1);
  }
  return cut.trimEnd() + "..";
}

export async function buildReportPdf(input: ReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mark = await doc.embedPng(Buffer.from(BRAND_MARK_PNG_BASE64, "base64"));

  const usableW = PAGE_W - MARGIN * 2;
  const totalColW = input.columns.reduce((s, c) => s + c.width, 0);
  const scale = usableW / totalColW;
  const cols = input.columns.map((c) => ({ ...c, w: c.width * scale }));

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawHeader = (p: PDFPage) => {
    // Brand: icon + wordmark, baseline-aligned on the first header line.
    const markH = 18;
    const markW = markH * BRAND_MARK_ASPECT;
    p.drawImage(mark, { x: MARGIN, y: PAGE_H - MARGIN - 4, width: markW, height: markH });
    p.drawText("laundriroom", { x: MARGIN + markW + 6, y: PAGE_H - MARGIN, size: 16, font: bold, color: INK });
    p.drawText(pdfSafe(input.title), { x: MARGIN, y: PAGE_H - MARGIN - 22, size: 15, font: bold, color: INK });
    let my = PAGE_H - MARGIN - 40;
    for (const m of input.meta) {
      p.drawText(pdfSafe(m), { x: MARGIN, y: my, size: 9, font, color: SLATE });
      my -= 12;
    }
    return my - 8;
  };

  const drawColumnHeader = (p: PDFPage, top: number) => {
    let x = MARGIN;
    for (const c of cols) {
      const tw = bold.widthOfTextAtSize(c.header, 9);
      const tx = c.align === "right" ? x + c.w - tw - 6 : x + 2;
      p.drawText(c.header, { x: tx, y: top, size: 9, font: bold, color: INK });
      x += c.w;
    }
    p.drawLine({ start: { x: MARGIN, y: top - 5 }, end: { x: PAGE_W - MARGIN, y: top - 5 }, thickness: 1, color: LINE });
    return top - 20;
  };

  y = drawHeader(page);
  y = drawColumnHeader(page, y);

  const rowH = 16;
  const drawRow = (p: PDFPage, cells: string[], top: number, emphasise = false) => {
    let x = MARGIN;
    const f = emphasise ? bold : font;
    cells.forEach((cell, i) => {
      const c = cols[i];
      if (!c) return;
      const text = truncate(cell, f, 9, c.w - 8);
      const tw = f.widthOfTextAtSize(text, 9);
      const tx = c.align === "right" ? x + c.w - tw - 6 : x + 2;
      p.drawText(text, { x: tx, y: top, size: 9, font: f, color: emphasise ? INK : rgb(0.2, 0.24, 0.3) });
      x += c.w;
    });
  };

  for (const row of input.rows) {
    if (y < MARGIN + rowH) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = drawHeader(page);
      y = drawColumnHeader(page, y);
    }
    drawRow(page, row, y);
    y -= rowH;
  }

  if (input.totalsRow) {
    if (y < MARGIN + rowH * 2) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = drawHeader(page);
      y = drawColumnHeader(page, y);
    }
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_W - MARGIN, y: y + 4 }, thickness: 1, color: LINE });
    y -= 4;
    drawRow(page, input.totalsRow, y, true);
  }

  if (input.rows.length === 0) {
    page.drawText("No records for this report.", { x: MARGIN, y: y - 4, size: 10, font, color: SLATE });
  }

  return doc.save();
}
