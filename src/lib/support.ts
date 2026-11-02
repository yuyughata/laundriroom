import type { TicketStatus } from "@/lib/database.types";

/**
 * Predefined support categories and subcategories. Every category ends with
 * "Other", and the top-level "Other" lets a customer describe anything not
 * listed (free text captured in other_text).
 */
export const SUPPORT_CATEGORIES: { category: string; subcategories: string[] }[] = [
  {
    category: "Order & delivery",
    subcategories: ["Late delivery", "Missed or failed delivery", "Wrong delivery address", "Reschedule a pickup or delivery", "Other"],
  },
  {
    category: "Items & quality",
    subcategories: ["Missing item", "Damaged item", "Stain not removed", "Wrong item returned", "Poor finish or ironing", "Other"],
  },
  {
    category: "Payments & refunds",
    subcategories: ["Charged incorrectly", "Paid but not confirmed", "Refund request", "Question about pricing", "Other"],
  },
  {
    category: "Account & app",
    subcategories: ["Can't sign in", "Email verification issue", "Update my details", "App problem", "Other"],
  },
  {
    category: "Vendor & service",
    subcategories: ["Unprofessional service", "Vendor unresponsive", "Request a different vendor", "Other"],
  },
  {
    category: "Other",
    subcategories: ["Other"],
  },
];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export function ticketChip(status: TicketStatus): string {
  switch (status) {
    case "resolved": return "chip-ok";
    case "in_progress": return "chip-ink";
    case "closed": return "chip-muted";
    default: return "chip-warn"; // open
  }
}
