import QRCode from "qrcode";

const INK = "#0F1B2D";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * A QR code (PNG data URL) with the laundriroom mark in the middle. Uses the
 * highest error correction (H, ~30% recoverable) so the logo badge — about
 * 22% of the width, ~5% of the area — never stops it scanning. Browser only.
 * Falls back to a plain QR if the logo can't load.
 */
export async function qrWithLogo(text: string, size = 720): Promise<string> {
  const plain = await QRCode.toDataURL(text, {
    width: size, margin: 2, errorCorrectionLevel: "H", color: { dark: INK, light: "#FFFFFF" },
  });
  try {
    const [qr, logo] = await Promise.all([load(plain), load("/brand/mark-dark.png")]);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.drawImage(qr, 0, 0, size, size);
    const badge = Math.round(size * 0.22);
    const x = (size - badge) / 2, y = (size - badge) / 2, r = badge * 0.18;
    g.fillStyle = "#FFFFFF";
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + badge, y, x + badge, y + badge, r);
    g.arcTo(x + badge, y + badge, x, y + badge, r);
    g.arcTo(x, y + badge, x, y, r);
    g.arcTo(x, y, x + badge, y, r);
    g.closePath();
    g.fill();
    const w = badge * 0.74, h = w * (logo.height / logo.width);
    g.drawImage(logo, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL("image/png");
  } catch {
    return plain;
  }
}
