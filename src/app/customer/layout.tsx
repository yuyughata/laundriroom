import { requireRole } from "@/lib/auth";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  // Any signed-in user can use the customer app (staff/admins have their own areas,
  // but a customer role is required here to keep dashboards separate).
  await requireRole(["customer"]);
  return <>{children}</>;
}
