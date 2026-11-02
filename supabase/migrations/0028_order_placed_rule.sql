-- ═══════════════════════════════════════════════════════════════════════════
-- 0028 — Alert admins and the vendor's staff about new orders, by email and
-- WhatsApp. Fired from customer/actions.ts → createOrder with
-- { event: 'order_placed', order_id } (alongside the customer's
-- order_confirmed). Recipient 'vendor' = active vendor managers and
-- attendants attached to the order's vendor.
-- ═══════════════════════════════════════════════════════════════════════════

insert into notification_rules (event, channels, fallback_order, recipients, enabled)
select 'order_placed', '{email,whatsapp}'::notif_channel[], '{whatsapp,email}'::notif_channel[], '{admin,vendor}'::text[], true
where not exists (select 1 from notification_rules where event = 'order_placed');

insert into notification_templates (event, channel, subject, body)
select 'order_placed', 'whatsapp', null,
       'New order {{order_code}} at {{vendor_name}} from {{customer_name}} ({{customer_phone}}): {{entry_line}}, {{return_line}}, {{service_line}}. Open: {{order_url}}'
where not exists (select 1 from notification_templates where event = 'order_placed' and channel = 'whatsapp');
