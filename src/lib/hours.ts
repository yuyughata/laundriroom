/**
 * Vendor opening-hours helper. Drop-off and pickup are only offered while a
 * laundry is open. Default hours are 07:00–18:00 (Africa/Lagos) when a vendor
 * hasn't set its own.
 */

const DEFAULT_OPEN = 7 * 60; // 07:00
const DEFAULT_CLOSE = 18 * 60; // 18:00

function lagosNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function toMinutes(t: string | null | undefined, fallback: number): number {
  if (!t) return fallback;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export type VendorHours = { is_open: boolean; opens_at: string | null; closes_at: string | null };

/** Is the vendor open right now (manual toggle on, and within hours)? */
export function isVendorOpenNow(v: VendorHours): boolean {
  if (!v.is_open) return false;
  const now = lagosNowMinutes();
  const open = toMinutes(v.opens_at, DEFAULT_OPEN);
  const close = toMinutes(v.closes_at, DEFAULT_CLOSE);
  return now >= open && now < close;
}

/** "7:00 AM" style label for an hours value (or the default). */
export function hoursLabel(opens: string | null, closes: string | null): string {
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h < 12 ? "am" : "pm";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, "0")}${ampm}`;
  };
  return `${fmt(toMinutes(opens, DEFAULT_OPEN))}–${fmt(toMinutes(closes, DEFAULT_CLOSE))}`;
}
