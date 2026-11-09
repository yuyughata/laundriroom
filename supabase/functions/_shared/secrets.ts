// deno-lint-ignore-file no-explicit-any
// Provider keys (Resend, WhatsApp) entered on Admin → Integrations are kept
// in Supabase Vault (migration 0046) and read here with the service key.
// A function secret of the same name still works as a fallback.

const ENV_NAME: Record<string, string> = { resend: "RESEND_API_KEY", whatsapp: "WHATSAPP_API_TOKEN", sms: "SMS_API_KEY" };

export async function providerKey(db: any, provider: string): Promise<string | null> {
  try {
    const { data } = await db.rpc("integration_secret", { p_provider: provider });
    if (typeof data === "string" && data.trim()) return data.trim();
  } catch { /* fall back to the function secret */ }
  const env = Deno.env.get(ENV_NAME[provider] ?? "");
  return env && env.trim() ? env.trim() : null;
}
