import { SERVICE_LABEL } from "@/lib/format";
import type { ServiceType } from "@/lib/database.types";

/**
 * Per-vendor service settings (0061). The three services stay system-wide;
 * each vendor can turn one off or rename its customer-facing label. A missing
 * row means "offered, default label".
 */

export const ALL_SERVICES: ServiceType[] = ["wash_and_fold", "dry_clean", "press_only"];

export type VendorServiceRow = { service: ServiceType; enabled: boolean; label: string | null };
export type ServiceConfig = { service: ServiceType; enabled: boolean; label: string };

/** Merge stored rows with defaults into one config per service, in canonical order. */
export function resolveServices(rows: VendorServiceRow[]): ServiceConfig[] {
  const by = new Map(rows.map((r) => [r.service, r]));
  return ALL_SERVICES.map((service) => {
    const r = by.get(service);
    const label = r?.label?.trim() ? r.label.trim() : SERVICE_LABEL[service];
    return { service, enabled: r ? r.enabled : true, label };
  });
}

/** service → customer-facing label (falls back to the default). */
export function serviceLabels(rows: VendorServiceRow[]): Record<ServiceType, string> {
  const out = { ...SERVICE_LABEL };
  for (const c of resolveServices(rows)) out[c.service] = c.label;
  return out;
}

/** The services this vendor offers (enabled), in canonical order. */
export function enabledServices(rows: VendorServiceRow[]): ServiceType[] {
  return resolveServices(rows).filter((c) => c.enabled).map((c) => c.service);
}
