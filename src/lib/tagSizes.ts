// Tag print sizes and A4 sheet layout (shared by the PDF builder and the UI).

/** Square tag sizes we print, in millimetres. */
export const TAG_SIZES_MM = [20, 25, 30] as const;
export type TagSizeMm = (typeof TAG_SIZES_MM)[number];
export const DEFAULT_TAG_SIZE_MM: TagSizeMm = 25;

export const tagSizeFrom = (v: unknown): TagSizeMm => {
  const n = Number(v);
  return (TAG_SIZES_MM as readonly number[]).includes(n) ? (n as TagSizeMm) : DEFAULT_TAG_SIZE_MM;
};
export const tagSizeLabel = (mm: number) => `${(mm / 10).toLocaleString("en", { maximumFractionDigits: 1 })} cm`;

/** A4 sheet geometry, in PDF points. */
export const PT_PER_MM = 72 / 25.4;
export const SHEET = {
  w: 595.28,
  h: 841.89,
  margin: 10 * PT_PER_MM, // 1 cm — inside every printer's printable area
  header: 20,
  footer: 22,
};

/** How many tags fit on one A4 page at this size. */
export function tagsPerPage(sizeMm: number) {
  const s = sizeMm * PT_PER_MM;
  const cols = Math.floor((SHEET.w - SHEET.margin * 2) / s);
  const rows = Math.floor((SHEET.h - SHEET.margin * 2 - SHEET.header - SHEET.footer) / s);
  return { cols, rows, perPage: cols * rows };
}
