import { redirect } from "next/navigation";

// Item requests moved into the "Items" page (Requests tab).
export default function RequestsRedirect() {
  redirect("/vendor/items");
}
