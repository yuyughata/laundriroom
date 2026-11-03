// Server-side only: used when building tag sheets.
import QRCode, { type QRCodeMaskPattern } from "qrcode";

/*
 * Small QR codes (version 1, as our tag codes are) occasionally contain data
 * that zxing — the decoder inside the app's camera scanner (html5-qrcode) —
 * mistakes for a corner marker, and then it can't read them, although they are
 * valid (other decoders read them). A QR code can be drawn with any of 8
 * masks, so we pick one per code that zxing reads, checked at a few pixel
 * sizes like a camera would see.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const ZX: any = require("html5-qrcode/third_party/zxing-js.umd.js");

const MASKS: QRCodeMaskPattern[] = [1, 2, 7, 4, 3, 0, 5, 6]; // most reliable first (tested)
// Pixels per module, as a camera or printer might land: whole and uneven
// sizes (uneven ones get soft, anti-aliased edges).
const SCALES = [3, 4, 4.6, 5.5, 6, 7.3, 9];
const QUIET = 2;             // modules of white around the code, as printed

function zxingReads(modules: { size: number; get(r: number, c: number): number }, scale: number, want: string) {
  const n = modules.size + QUIET * 2;
  const w = Math.round(n * scale);
  const lum = new Uint8ClampedArray(w * w);
  const dark = (px: number, py: number) => {
    const r = Math.floor(py / scale) - QUIET, c = Math.floor(px / scale) - QUIET;
    return r >= 0 && c >= 0 && r < modules.size && c < modules.size && modules.get(r, c) ? 1 : 0;
  };
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      // 2×2 samples per pixel.
      const d = dark(x + 0.25, y + 0.25) + dark(x + 0.75, y + 0.25) + dark(x + 0.25, y + 0.75) + dark(x + 0.75, y + 0.75);
      lum[y * w + x] = 255 - d * 63.75;
    }
  }
  const hints = new Map();
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.QR_CODE]);
  hints.set(ZX.DecodeHintType.TRY_HARDER, false); // as the app's scanner runs it
  try {
    const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(lum, w, w)));
    return new ZX.MultiFormatReader(false, hints).decode(bitmap).getText() === want;
  } catch {
    return false;
  }
}

/** The mask to draw this code with so the app's scanner reads it. */
export function scannableMask(code: string, errorCorrectionLevel: "M" | "Q" = "Q"): QRCodeMaskPattern | undefined {
  let best: { mask: QRCodeMaskPattern; ok: number } | null = null;
  for (const mask of MASKS) {
    const { modules } = QRCode.create(code, { errorCorrectionLevel, maskPattern: mask });
    const ok = SCALES.filter((s) => zxingReads(modules, s, code)).length;
    if (ok === SCALES.length) return mask;
    if (!best || ok > best.ok) best = { mask, ok };
  }
  return best?.mask;
}
