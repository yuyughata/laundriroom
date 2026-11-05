import { redirect } from "next/navigation";

/** The Riders page is now Dispatch; keep old links working. */
export default function RidersMoved() {
  redirect("/vendor/dispatch");
}
