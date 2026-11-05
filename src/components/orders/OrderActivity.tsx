import { money, STAGE_LABEL } from "@/lib/format";
import type { StageKind } from "@/lib/database.types";

/** One row of get_order_activity() (migration 0039). */
export type ActivityRow = {
  at: string; kind: "placed" | "pickup" | "item" | "stage" | "payment";
  label: string; staff_name: string | null; staff_role: string | null;
};

const ROLE: Record<string, string> = {
  vendor_manager: "Manager", attendant: "Attendant", rider: "Rider",
  platform_admin: "laundriroom admin", support_agent: "laundriroom support",
};

function describe(r: ActivityRow): string {
  switch (r.kind) {
    case "placed": return r.label === "entered" ? "Order entered for the customer" : "Order placed by the customer";
    case "pickup": return "Pickup confirmed with the customer’s PIN";
    case "item": return `Checked in ${r.label}`;
    case "payment": return `Payment received · ${money(Number(r.label) || 0)}`;
    case "stage": {
      const [key, skipped] = r.label.split(":");
      const name = key === "handover" ? "Handed over (code confirmed)"
        : key === "check_in" ? "Check-in started"
        : STAGE_LABEL[key as StageKind] ?? key;
      return skipped ? `${name} — skipped` : name;
    }
  }
}

const when = (iso: string) => new Date(iso).toLocaleString("en-NG", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos",
});

/**
 * The order's timeline with the staff member behind each step. Staff sign in
 * with their own accounts, so every check-in, stage and handover is recorded
 * under the person who did it.
 */
export function OrderActivity({ rows }: { rows: ActivityRow[] }) {
  return (
    <section className="card mt-6 p-4">
      <h2 className="font-display text-lg text-ink">Activity</h2>
      <p className="mt-1 text-xs text-slate">Every step on this order and who did it.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-ink/5">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <span className="text-ink">{describe(r)}</span>
              <span className="text-xs text-slate">
                {r.staff_name
                  ? <><span className="font-medium text-ink">{r.staff_name}</span>{r.staff_role ? ` · ${ROLE[r.staff_role] ?? r.staff_role}` : ""}</>
                  : r.kind === "placed" || r.kind === "payment" ? "Customer" : "Not recorded"}
                {" · "}{when(r.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
