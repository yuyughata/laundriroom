import { redirect } from "next/navigation";

/** Newsletters moved to Admin → Emails (a newsletter is one kind of email). */
export default function OldNewsletters() {
  redirect("/admin/emails");
}
