import { requireRole } from "@/lib/auth";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["attendant", "vendor_manager", "rider"]);
  return <>{children}</>;
}
