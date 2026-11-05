// deno-lint-ignore-file no-explicit-any
// ============================================================================
// send-newsletter — send an Admin → Newsletters campaign by email (Resend).
//
// Called by the app server with `Authorization: Bearer <service-role key>`:
//   { newsletter_id, test_to?, test_profile_id?, site_url? }
//   • test_to: send one copy to that address ("[Test]" subject), nothing else
//     changes except last_test_at.
//   • otherwise: claim the newsletter (draft → sending, so it can never go out
//     twice), resolve its audience with newsletter_audience() (active people
//     with an email who haven't opted out), log each recipient, answer straight
//     away, then send in batches of 100 in the background. Every email has its
//     own unsubscribe link (/unsubscribe?t=<token>) and a one-click
//     List-Unsubscribe header (POST /api/unsubscribe?t=<token>).
//
// Needs Resend connected on Admin → Integrations (from address) and the
// RESEND_API_KEY secret. SITE_URL (secret) or site_url builds the links.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderNewsletter, newsletterText, UNSUBSCRIBE_PLACEHOLDER } from "../_shared/newsletter.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const BATCH = 100;

Deno.serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SERVICE_KEY || req.headers.get("Authorization") !== `Bearer ${SERVICE_KEY}`) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as any));
  const id = String(body?.newsletter_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "newsletter_id required" }, 400);
  const SITE = (Deno.env.get("SITE_URL") || body?.site_url || "").replace(/\/$/, "");
  if (!SITE) return json({ error: "SITE_URL isn't set, so links can't be built." }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: n } = await db.from("newsletters").select("*").eq("id", id).maybeSingle();
  if (!n) return json({ error: "newsletter not found" }, 404);

  const { data: integ } = await db.from("integration_settings").select("status, config").eq("provider", "resend").maybeSingle();
  const KEY = Deno.env.get("RESEND_API_KEY");
  if (!KEY || (integ as any)?.status !== "connected") {
    return json({ error: "Email isn't connected: set up Resend on Admin → Integrations (and the RESEND_API_KEY secret)." }, 400);
  }
  const from = (integ as any)?.config?.from ?? "laundriroom <notifications@laundriroom.example>";

  const content = {
    subject: n.subject, preheader: n.preheader, headerImageUrl: n.header_image_url, footerImageUrl: n.footer_image_url,
    bodyHtml: n.body_html, ctaLabel: n.cta_label, ctaUrl: n.cta_url,
  };
  const html = renderNewsletter(content, { iconUrl: `${SITE}/brand/mark-email.png` });
  const text = newsletterText(content);
  const pageUrl = (token: string) => `${SITE}/unsubscribe?t=${token}`;
  const oneClickUrl = (token: string) => `${SITE}/api/unsubscribe?t=${token}`;
  const emailFor = (to: string, token: string | null, subject = n.subject) => {
    const unsub = token ? pageUrl(token) : `${SITE}/unsubscribe`;
    return {
      from, to, subject,
      html: html.split(UNSUBSCRIBE_PLACEHOLDER).join(unsub),
      text: text.split(UNSUBSCRIBE_PLACEHOLDER).join(unsub),
      ...(token ? { headers: { "List-Unsubscribe": `<${oneClickUrl(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    };
  };

  // ── Test send: one copy to the admin ──────────────────────────────────────
  if (body?.test_to) {
    let token: string | null = null;
    if (body?.test_profile_id) {
      const { data: p } = await db.from("profiles").select("unsubscribe_token").eq("id", body.test_profile_id).maybeSingle();
      token = (p as any)?.unsubscribe_token ?? null;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(emailFor(String(body.test_to), token, `[Test] ${n.subject}`)),
    });
    if (!res.ok) return json({ error: `Resend: ${(await res.text()).slice(0, 300)}` }, 502);
    await db.from("newsletters").update({ last_test_at: new Date().toISOString() }).eq("id", id);
    return json({ sent: 1 });
  }

  // ── Real send ─────────────────────────────────────────────────────────────
  const { data: claimed } = await db.from("newsletters")
    .update({ status: "sending", last_error: null }).eq("id", id).eq("status", "draft").select("id").maybeSingle();
  if (!claimed) return json({ error: "This newsletter is already sending or sent." }, 409);

  const { data: people, error: aErr } = await db.rpc("newsletter_audience", { p_audience: n.audience });
  const list = ((people ?? []) as { profile_id: string; email: string; unsubscribe_token: string }[]);
  if (aErr || list.length === 0) {
    await db.from("newsletters").update({ status: "draft", last_error: aErr?.message ?? "Nobody to send to." }).eq("id", id);
    return json({ error: aErr?.message ?? "Nobody to send to." }, 400);
  }
  for (let i = 0; i < list.length; i += 500) {
    await db.from("newsletter_recipients").upsert(
      list.slice(i, i + 500).map((p) => ({ newsletter_id: id, email: p.email, profile_id: p.profile_id, status: "queued" })),
      { onConflict: "newsletter_id,email", ignoreDuplicates: true },
    );
  }
  await db.from("newsletters").update({ recipient_count: list.length }).eq("id", id);

  const work = (async () => {
    let lastError: string | null = null;
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const emails = chunk.map((p) => p.email);
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(chunk.map((p) => emailFor(p.email, p.unsubscribe_token))),
        });
        if (res.ok) {
          await db.from("newsletter_recipients").update({ status: "sent", sent_at: new Date().toISOString(), error: null })
            .eq("newsletter_id", id).in("email", emails);
        } else {
          lastError = `Resend: ${(await res.text()).slice(0, 300)}`;
          await db.from("newsletter_recipients").update({ status: "failed", error: lastError }).eq("newsletter_id", id).in("email", emails);
        }
      } catch (e) {
        lastError = (e as Error).message || "send failed";
        await db.from("newsletter_recipients").update({ status: "failed", error: lastError }).eq("newsletter_id", id).in("email", emails);
      }
      if (i + BATCH < list.length) await new Promise((r) => setTimeout(r, 600)); // stay under Resend's rate limit
    }
    const { count: sent } = await db.from("newsletter_recipients").select("*", { count: "exact", head: true }).eq("newsletter_id", id).eq("status", "sent");
    const { count: failed } = await db.from("newsletter_recipients").select("*", { count: "exact", head: true }).eq("newsletter_id", id).eq("status", "failed");
    await db.from("newsletters").update({
      status: (sent ?? 0) > 0 ? "sent" : "failed", sent_count: sent ?? 0, failed_count: failed ?? 0,
      sent_at: new Date().toISOString(), last_error: lastError,
    }).eq("id", id);
  })();

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
  else await work;
  return json({ recipients: list.length, queued: true }, 202);
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
