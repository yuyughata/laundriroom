-- ═══════════════════════════════════════════════════════════════════════════
-- 0029 — The order_placed WhatsApp text uses {{return_mode_line}}
-- ({{return_line}} is already the "we'll deliver / come collect" sentence in
-- the ready_for_delivery template, with a different meaning).
-- ═══════════════════════════════════════════════════════════════════════════

update notification_templates
   set body = 'New order {{order_code}} at {{vendor_name}} from {{customer_name}} ({{customer_phone}}): {{entry_line}}, {{return_mode_line}}, {{service_line}}. Open: {{order_url}}',
       updated_at = now()
 where event = 'order_placed' and channel = 'whatsapp';
