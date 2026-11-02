import { requireRole } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["platform_admin", "support_agent"]);
  return <>{children}</>;
}
