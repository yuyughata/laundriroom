/* eslint-disable @next/next/no-img-element */

/**
 * laundriroom brand lockup — the hanger-and-garment mark plus the wordmark.
 * variant "light" = ivory mark/text for dark backgrounds; "dark" = ink for
 * light backgrounds. Size follows the font-size set via className.
 */
export function Logo({
  variant = "dark", className = "text-xl", wordmark = true,
}: { variant?: "light" | "dark"; className?: string; wordmark?: boolean }) {
  const src = variant === "light" ? "/brand/mark-light.png" : "/brand/mark-dark.png";
  const color = variant === "light" ? "text-ivory" : "text-ink";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src={src} alt="laundriroom" style={{ height: "1.35em", width: "auto" }} />
      {wordmark && (
        <span className={`font-sans font-semibold lowercase tracking-tight ${color}`}>laundriroom</span>
      )}
    </span>
  );
}
