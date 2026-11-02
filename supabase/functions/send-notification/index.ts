// deno-lint-ignore-file no-explicit-any
// ============================================================================
// send-notification — the one place that turns an event into messages.
// Reads the admin's notification_rules + templates, resolves recipients, and
// dispatches on each active channel via an adapter. SMS is fully wired but only
// fires once its provider is connected (integration_settings.status).
//
// Call it from server code (or a DB webhook) with { event, order_id, context }
// and `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`; other callers get 401.
// Deploy:  supabase functions deploy send-notification
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { EMAIL_TEMPLATES } from "../_shared/emails.ts";

type Channel = "email" | "whatsapp" | "sms";

Deno.serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Server-to-server only: the caller must present the service-role key.
  // Otherwise anyone holding the public anon key could make us email customers.
  if (req.headers.get("Authorization") !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { event, order_id, context = {} } = await req.json().catch(() => ({}));
  if (!event) return json({ error: "event required" }, 400);

  const { data: rule } = await db.from("notification_rules").select("*").eq("event", event).maybeSingle();
  if (!rule || !rule.enabled || rule.channels.length === 0) {
    return json({ skipped: true, reason: "no active rule" });
  }

  // Which providers are connected right now.
  const { data: integrations } = await db.from("integration_settings").select("provider, status, config");
  const connected = new Map<string, any>((integrations ?? []).map((i: any) => [i.provider, i]));

  // Resolve recipient contacts for this order.
  const recipients = await resolveRecipients(db, order_id, rule.recipients);

  const results: any[] = [];
  for (const channel of rule.channels as Channel[]) {
    const provider = channel === "email" ? "resend" : channel;
    const integ = connected.get(provider);
    if (!integ || integ.status !== "connected") {
      await log(db, event, channel, order_id, null, "skipped", "provider not configured");
      results.push({ channel, status: "skipped" });
      continue;
    }

    // Email uses the designed Ink & Ivory HTML templates; WhatsApp/SMS use the
    // plain-text templates stored in notification_templates.
    const { data: tpl } = await db.from("notification_templates")
      .select("subject, body").eq("event", event).eq("channel", channel).maybeSingle();

    for (const to of recipients) {
      const vars = { ...context, ...to.vars };
      try {
        if (channel === "email" && EMAIL_TEMPLATES[event]) {
          const { subject, html, text } = EMAIL_TEMPLATES[event](vars);
          await sendEmail(to.address, subject, html, text, integ);
        } else {
          const body = render(tpl?.body ?? "{{order_code}}", vars);
          await dispatch(channel, to.address, tpl?.subject ?? "laundriroom", body, integ);
        }
        await log(db, event, channel, order_id, to.address, "sent", null);
        results.push({ channel, to: to.address, status: "sent" });
      } catch (e) {
        await log(db, event, channel, order_id, to.address, "failed", String(e));
        results.push({ channel, to: to.address, status: "failed" });
      }
    }
  }

  return json({ event, results });
});

async function resolveRecipients(db: any, orderId: string | null, roles: string[]) {
  const out: { address: string; vars: Record<string, string> }[] = [];
  if (!orderId) return out;
  const { data: order } = await db
    .from("orders")
    .select("code, total, customer:customer_id(email, phone, full_name), vendor:vendor_id(name)")
    .eq("id", orderId).maybeSingle();
  if (!order) return out;
  const vars = { order_code: order.code, total: String(order.total), vendor_name: order.vendor?.name ?? "" };
  if (roles.includes("customer") && order.customer?.email) {
    out.push({ address: order.customer.email, vars: { ...vars, customer_name: order.customer.full_name ?? "" } });
  }
  // vendor/admin/rider addresses would be resolved here similarly.
  return out;
}

// ─── Channel adapters ───────────────────────────────────────────────────────
/** Send a designed HTML email (with a plain-text part) via Resend. */
async function sendEmail(to: string, subject: string, html: string, text: string, integ: any) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: integ.config?.from ?? "laundriroom <notifications@laundriroom.example>", to, subject, html, text }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function dispatch(channel: Channel, to: string, subject: string, body: string, integ: any) {
  if (channel === "email") {
    await sendEmail(to, subject, `<p>${body}</p>`, body, integ);
    return;
  }
  if (channel === "whatsapp") {
    // WhatsApp Cloud API — implement with your phone number id + token.
    throw new Error("WhatsApp adapter not implemented in this build");
  }
  if (channel === "sms") {
    // SMS provider (Nigerian routes) — framework ready; wire your provider here.
    throw new Error("SMS adapter not implemented in this build");
  }
}

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

async function log(db: any, event: string, channel: string, order_id: string | null, recipient: string | null, status: string, detail: string | null) {
  await db.from("notification_log").insert({ event, channel, order_id, recipient, status, detail });
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
