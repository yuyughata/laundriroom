import type { OrderStatus, ServiceType, ServiceTier, Turnaround, StageKind } from "@/lib/database.types";

const ngn = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function money(amount: number | null | undefined): string {
  return ngn.format(Number(amount ?? 0));
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NG", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

export const SERVICE_LABEL: Record<ServiceType, string> = {
  wash_and_fold: "Wash & fold",
  dry_clean: "Dry clean",
  press_only: "Press only",
};

export const TIER_LABEL: Record<ServiceTier, string> = {
  standard: "Standard",
  premium: "Premium",
};

export const TURNAROUND_LABEL: Record<Turnaround, string> = {
  normal: "Normal",
  express: "Express",
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_dropoff: "Awaiting drop-off",
  pickup_requested: "Pickup requested",
  checked_in: "Checked in",
  processing: "In progress",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  awaiting_collection: "Ready to collect",
  closed: "Completed",
  cancelled: "Cancelled",
};

/** chip style class for a status */
export function statusChip(status: OrderStatus): string {
  switch (status) {
    case "closed": return "chip-ok";
    case "ready":
    case "out_for_delivery":
    case "awaiting_collection": return "chip-ink";
    case "cancelled": return "chip-warn";
    default: return "chip-muted";
  }
}

export const STAGE_LABEL: Record<StageKind, string> = {
  check_in: "Check-in",
  sorting: "Sorting",
  washing: "Washing",
  drying: "Drying",
  pressing: "Pressing",
  quality_check: "Quality check",
  packaging: "Packaging",
  final_completion: "Final completion",
  out_for_delivery: "Out for delivery",
  handover: "Handover",
};

/** The ordered processing stages an attendant presses, in order. */
export const PROCESSING_STAGES: StageKind[] = [
  "sorting", "washing", "drying", "pressing", "quality_check", "packaging", "final_completion",
];
