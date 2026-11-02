"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyTicket } from "@/lib/notify";

/** Customer opens a support ticket (with its first message). */
export async function createTicket(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const category = String(formData.get("category") || "").trim();
  const subcategory = String(formData.get("subcategory") || "").trim() || null;
  const other_text = String(formData.get("other_text") || "").trim() || null;
  const order_id = String(formData.get("order_id") || "") || null;
  const subject = String(formData.get("subject") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!category) return { error: "Please choose a category." };
  if (!subject) return { error: "Please add a short subject." };
  if (!message) return { error: "Please describe the issue." };
  if ((subcategory === "Other" || category === "Other") && !other_text) {
    return { error: "Please describe your issue in the 'Other' box." };
  }

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({ customer_id: user.id, order_id, category, subcategory, other_text, subject })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: msgErr } = await supabase
    .from("support_messages")
    .insert({ ticket_id: ticket.id, author_id: user.id, from_support: false, body: message } as never);
  if (msgErr) return { error: msgErr.message };

  await notifyTicket("ticket_opened", ticket.id);
  revalidatePath("/customer/support");
  redirect(`/customer/support/${ticket.id}`);
}

/** Customer adds a message to their ticket. */
export async function addCustomerMessage(ticketId: string, body: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!body.trim()) return { error: "Message is empty." };

  const { error } = await supabase
    .from("support_messages")
    .insert({ ticket_id: ticketId, author_id: user.id, from_support: false, body: body.trim() } as never);
  if (error) return { error: error.message };
  await notifyTicket("ticket_message", ticketId);
  revalidatePath(`/customer/support/${ticketId}`);
  return { ok: true };
}
