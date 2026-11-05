"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyTicket } from "@/lib/notify";
import type { TicketStatus } from "@/lib/database.types";
import { cleanAttachments } from "@/lib/supportPhotos";

async function requireSupport() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (data?.role !== "platform_admin" && data?.role !== "support_agent") {
    return { ok: false as const, error: "Support staff only." };
  }
  return { ok: true as const, supabase, userId: user.id };
}

export async function replyTicket(ticketId: string, body: string, photos: string[] = []) {
  const g = await requireSupport();
  if (!g.ok) return { error: g.error };
  const attachments = cleanAttachments(photos, g.userId);
  if (!Array.isArray(attachments)) return attachments;
  if (!body.trim() && !attachments.length) return { error: "Message is empty." };

  const { error } = await g.supabase.from("support_messages").insert({
    ticket_id: ticketId, author_id: g.userId, from_support: true, body: body.trim() || "Photo attached",
    ...(attachments.length ? { attachments } : {}),
  } as never);
  if (error) return { error: error.message };

  // Replying moves an open ticket to in progress.
  await g.supabase.from("support_tickets")
    .update({ status: "in_progress" } as never)
    .eq("id", ticketId).eq("status", "open");

  await notifyTicket("ticket_reply", ticketId);
  revalidatePath(`/admin/support/${ticketId}`);
  return { ok: true };
}

export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  const g = await requireSupport();
  if (!g.ok) return { error: g.error };
  const { error } = await g.supabase.from("support_tickets").update({ status } as never).eq("id", ticketId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function assignToMe(ticketId: string) {
  const g = await requireSupport();
  if (!g.ok) return { error: g.error };
  const { error } = await g.supabase
    .from("support_tickets").update({ assigned_to: g.userId } as never).eq("id", ticketId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/support/${ticketId}`);
  return { ok: true };
}
