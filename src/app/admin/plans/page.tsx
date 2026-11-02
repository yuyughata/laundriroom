import { redirect } from "next/navigation";

/** "Plans & fees" was merged into Fees & charges. */
export default function AdminPlans() {
  redirect("/admin/fees");
}
