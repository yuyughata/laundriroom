// Server-side only.
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupportMessage } from "@/lib/database.types";

/** Check and normalise the photo paths a user sends with a support message. */
export function cleanAttachments(raw: unknown, userId: string): string[] | { error: string } {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try { list = raw ? JSON.parse(raw) : []; } catch { return { error: "Couldn’t read the attached photos." }; }
  }
  if (!Array.isArray(list)) return [];
  const paths = list.filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length > 4) return { error: "Attach up to 4 photos." };
  if (paths.some((p) => !p.startsWith(`${userId}/`) || p.includes(".."))) return { error: "Those photos can’t be attached." };
  return paths;
}

/**
 * Signed links (1 hour) for the photos on messages the viewer can already
 * read — the messages were loaded under the viewer's own access rules, so
 * the service key here only lets a customer see photos support attached.
 */
export async function signSupportPhotos(messages: SupportMessage[]): Promise<Record<string, string>> {
  const paths = [...new Set(messages.flatMap((m) => m.attachments ?? []))];
  if (!paths.length) return {};
  const client = createServiceClient() ?? createClient();
  const { data } = await client.storage.from("support-attachments").createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { path: string | null; signedUrl: string | null }[]) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}
