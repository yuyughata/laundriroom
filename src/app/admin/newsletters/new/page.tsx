import { redirect } from "next/navigation";

/** Newsletters are started from the list ("New newsletter" creates the draft). */
export default function NewNewsletter() {
  redirect("/admin/newsletters");
}
