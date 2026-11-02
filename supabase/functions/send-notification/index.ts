// deno-lint-ignore-file no-explicit-any
// ============================================================================
// send-notification — the one place that turns an event into messages.
// Reads the admin's notification_rules + templates, resolves recipients, and
// dispatches on each active channel via an adapter. A channel only fires once
// its provider is connected (integration_settings.status).
//
// Call it from server code (or a DB webhook) with JSON
//   { event, order_id?, user_id?, ticket_id?, context? }
// and `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`; other callers get 401.
//   order_id  → order events; recipients from the rule ('customer', 'admin')
//   user_id   → account events, sent to that account holder
//   ticket_id → support events; ticket details are read from the database
// Recipient 'admin' = every active platform_admin and support_agent;
// 'customer' = the order's or the ticket's customer.
//
// Secrets: RESEND_API_KEY (email), WHATSAPP_API_TOKEN (+ phone number ID on
// Admin → Integrations, or WHATSAPP_PHONE_ID), SITE_URL for links.
// Deploy:  supabase functions deploy send-notification
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { EMAIL_TEMPLATES } from "../_shared/emails.ts";

type Channel = "email" | "whatsapp" | "sms";
type Recipient = { email: string | null; phone: string | null; vars: Record<string, string> };

const TICKET_STATUS: Record<string, string> = {
  open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed",
};

Deno.serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SITE = (Deno.env.get("SITE_URL") ?? "http://localhost:3000").replace(/\/$/, "");

  // Server-to-server only: the caller must present the service-role key.
  // Otherwise anyone holding the public anon key could make us message people.
  if (req.headers.get("Authorization") !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { event, order_id = null, user_id = null, ticket_id = null, context = {} } =
    await req.json().catch(() => ({}));
  if (!event) return json({ error: "event required" }, 400);

  const { data: rule } = await db.from("notification_rules").select("*").eq("event", event).maybeSingle();
  if (!rule || !rule.enabled || rule.channels.length === 0) {
    return json({ skipped: true, reason: "no active rule" });
  }

  // Which providers are connected right now.
  const { data: integrations } = await db.from("integration_settings").select("provider, status, config");
  const connected = new Map<string, any>((integrations ?? []).map((i: any) => [i.provider, i]));

  // Shared variables for the templates, then who gets the message.
  const base: Record<string, string> = {};
  // A support reply quotes the latest support message; other ticket events
  // quote the customer's latest message.
  if (ticket_id) Object.assign(base, await ticketVars(db, ticket_id, SITE, event === "ticket_reply"));
  if (order_id) Object.assign(base, await orderVars(db, order_id));

  const recipients: Recipient[] = user_id
    ? await resolveUser(db, user_id)
    : await resolveRecipients(db, order_id, ticket_id, rule.recipients ?? []);

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
      const address = channel === "email" ? to.email : toPhoneNumber(to.phone);
      if (!address) {
        await log(db, event, channel, order_id, null, "skipped", `recipient has no ${channel === "email" ? "email" : "phone"}`);
        results.push({ channel, status: "skipped", reason: "no address" });
        continue;
      }
      const vars = { ...base, ...context, ...to.vars };
      try {
        if (channel === "email" && EMAIL_TEMPLATES[event]) {
          const { subject, html, text } = EMAIL_TEMPLATES[event](vars);
          await sendEmail(address, subject, html, text, integ);
        } else {
          const body = render(tpl?.body ?? "{{order_code}}", vars);
          await dispatch(channel, address, tpl?.subject ?? "laundriroom", body, integ);
        }
        await log(db, event, channel, order_id, address, "sent", null);
        results.push({ channel, to: address, status: "sent" });
      } catch (e) {
        await log(db, event, channel, order_id, address, "failed", String(e));
        results.push({ channel, to: address, status: "failed", error: String(e) });
      }
    }
  }

  return json({ event, results });
});

// ─── Recipients & variables ─────────────────────────────────────────────────
async function resolveUser(db: any, userId: string): Promise<Recipient[]> {
  const { data: p } = await db.from("profiles").select("email, phone, full_name").eq("id", userId).maybeSingle();
  if (!p) return [];
  return [{ email: p.email ?? null, phone: p.phone ?? null, vars: { customer_name: p.full_name ?? "", email: p.email ?? "" } }];
}

/** Admins & support agents who should hear about platform events. */
async function resolveAdmins(db: any): Promise<Recipient[]> {
  const { data } = await db.from("profiles").select("email, phone, full_name")
    .in("role", ["platform_admin", "support_agent"]).eq("status", "active");
  return (data ?? []).map((p: any) => ({
    email: p.email ?? null, phone: p.phone ?? null, vars: { admin_name: (p.full_name ?? "").split(" ")[0] },
  }));
}

async function resolveRecipients(
  db: any, orderId: string | null, ticketId: string | null, roles: string[],
): Promise<Recipient[]> {
  const out: Recipient[] = [];
  if (roles.includes("admin")) out.push(...await resolveAdmins(db));
  if (ticketId && roles.includes("customer")) {
    const { data: t } = await db.from("support_tickets")
      .select("customer:customer_id(email, phone, full_name)").eq("id", ticketId).maybeSingle();
    const c = t?.customer;
    if (c) out.push({ email: c.email ?? null, phone: c.phone ?? null, vars: { customer_name: c.full_name ?? "" } });
  } else if (orderId && roles.includes("customer")) {
    const { data: order } = await db.from("orders")
      .select("customer:customer_id(email, phone, full_name)").eq("id", orderId).maybeSingle();
    const c = order?.customer;
    if (c) out.push({ email: c.email ?? null, phone: c.phone ?? null, vars: { customer_name: c.full_name ?? "" } });
  }
  // vendor/rider recipients would be resolved here similarly.
  return out;
}

async function orderVars(db: any, orderId: string): Promise<Record<string, string>> {
  const { data: o } = await db.from("orders")
    .select("code, total, vendor:vendor_id(name)").eq("id", orderId).maybeSingle();
  if (!o) return {};
  return { order_code: o.code, total: String(o.total), vendor_name: o.vendor?.name ?? "" };
}

/** Ticket details come from the database, never from the caller. */
async function ticketVars(db: any, ticketId: string, site: string, fromSupport = false): Promise<Record<string, string>> {
  const { data: t } = await db.from("support_tickets")
    .select("id, number, subject, category, subcategory, other_text, status, customer:customer_id(full_name, email, phone), order:order_id(code)")
    .eq("id", ticketId).maybeSingle();
  if (!t) return {};
  const { data: last } = await db.from("support_messages").select("body")
    .eq("ticket_id", ticketId).eq("from_support", fromSupport)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const excerpt = String(last?.body ?? "").replace(/\s+/g, " ").trim();
  return {
    ticket_number: String(t.number),
    subject: t.subject ?? "",
    category: [t.category, t.subcategory !== "Other" ? t.subcategory : t.other_text].filter(Boolean).join(" · "),
    ticket_status: TICKET_STATUS[t.status] ?? t.status,
    customer_name: t.customer?.full_name || "A customer",
    customer_email: t.customer?.email ?? "",
    customer_phone: t.customer?.phone ?? "",
    order_code: t.order?.code ?? "",
    message_excerpt: excerpt.length > 280 ? excerpt.slice(0, 277) + "…" : excerpt,
    ticket_url: `${site}/admin/support/${t.id}`,
    customer_ticket_url: `${site}/customer/support/${t.id}`,
  };
}

/** Phone → international digits for WhatsApp/SMS (Nigerian 0803… → 234803…). */
export function toPhoneNumber(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = "234" + d.slice(1);
  return d.length >= 10 ? d : null;
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

/**
 * WhatsApp Cloud API (Meta). Business-initiated messages need an approved
 * template: set its name (and language) on Admin → Integrations → WhatsApp.
 * The template must have one body variable, {{1}}, which receives the
 * rendered message. Without a template, a plain text message is sent — Meta
 * only delivers those within 24 hours of the recipient last messaging you.
 */
async function sendWhatsApp(to: string, body: string, integ: any) {
  const token = Deno.env.get("WHATSAPP_API_TOKEN");
  if (!token) throw new Error("WHATSAPP_API_TOKEN missing");
  const phoneId = integ.config?.phone_id || Deno.env.get("WHATSAPP_PHONE_ID");
  if (!phoneId) throw new Error("WhatsApp phone number ID missing");
  // Template parameters can't contain newlines/tabs or 4+ spaces in a row.
  const text = body.replace(/\s+/g, " ").trim().slice(0, 1000);
  const template = String(integ.config?.template ?? "").trim();
  const payload = template
    ? {
        messaging_product: "whatsapp", to, type: "template",
        template: {
          name: template,
          language: { code: String(integ.config?.template_lang || "en").trim() },
          components: [{ type: "body", parameters: [{ type: "text", text }] }],
        },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: text } };
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v21.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
}

async function dispatch(channel: Channel, to: string, subject: string, body: string, integ: any) {
  if (channel === "email") {
    await sendEmail(to, subject, `<p>${body}</p>`, body, integ);
    return;
  }
  if (channel === "whatsapp") {
    await sendWhatsApp(to, body, integ);
    return;
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
