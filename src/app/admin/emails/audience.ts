import type { Newsletter } from "@/lib/database.types";

const GROUP_LABEL: Record<string, string> = {
  customers: "Customers", vendor_managers: "Laundry managers", vendor_staff: "Laundry staff", team: "laundriroom team", everyone: "Everyone",
};
/** "Customers + 3 people" */
export function audienceSummary(n: Pick<Newsletter, "audience">) {
  const g = (n.audience?.groups ?? []).map((x) => GROUP_LABEL[x] ?? x);
  const p = n.audience?.user_ids?.length ?? 0;
  return [...g, ...(p ? [`${p} ${p === 1 ? "person" : "people"}`] : [])].join(" + ") || "Nobody yet";
}

