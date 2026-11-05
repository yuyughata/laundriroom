"use server";

import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turn email broadcasts off for the person whose link this is. */
export async function unsubscribe(token: string): Promise<{ name: string } | { error: string }> {
  if (!UUID.test(token)) return { error: "This unsubscribe link isn't complete. Use the link from the email." };
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("unsubscribe_newsletter", { p_token: token });
  if (error) return { error: "Something went wrong. Please try again." };
  if (!data) return { error: "We couldn't find this link. It may be from an old email." };
  return { name: String(data) };
}
