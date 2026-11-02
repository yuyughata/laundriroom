/** Read-only star rating display. */
export function Stars({ value, size = 16, showValue = false, count }: {
  value: number; size?: number; showValue?: boolean; count?: number;
}) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24"
            fill={i <= rounded ? "#C6A664" : "none"} stroke="#C6A664" strokeWidth="1.5">
            <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6z" />
          </svg>
        ))}
      </span>
      {showValue && (
        <span className="text-xs text-slate">
          {value ? value.toFixed(1) : "—"}{typeof count === "number" ? ` (${count})` : ""}
        </span>
      )}
    </span>
  );
}
