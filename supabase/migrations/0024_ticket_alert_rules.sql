-- ═══════════════════════════════════════════════════════════════════════════
-- 0024 — Alert admins about support tickets by email and WhatsApp.
--
-- Recipients 'admin' = every active platform_admin and support_agent (email
-- for email, profiles.phone for WhatsApp/SMS). The app calls send-notification
-- with { event, ticket_id } when a customer opens a ticket or replies.
-- WhatsApp text below is the plain-text body; for messages outside WhatsApp's
-- 24-hour window it is sent inside the approved template set on
-- Admin → Integrations (see docs/CONNECT-DATABASE.md).
-- ═══════════════════════════════════════════════════════════════════════════

insert into notification_rules (event, channels, fallback_order, recipients, enabled)
select e, '{email,whatsapp}'::notif_channel[], '{whatsapp,email}'::notif_channel[], '{admin}'::text[], true
from unnest(array['ticket_opened', 'ticket_message']::notif_event[]) as e
where not exists (select 1 from notification_rules r where r.event = e);

insert into notification_templates (event, channel, subject, body)
select v.event::notif_event, 'whatsapp', null, v.body
from (values
  ('ticket_opened',  'New support ticket #{{ticket_number}} from {{customer_name}}: "{{subject}}" ({{category}}). Reply: {{ticket_url}}'),
  ('ticket_message', '{{customer_name}} replied on ticket #{{ticket_number}} "{{subject}}": {{message_excerpt}} Reply: {{ticket_url}}')
) as v(event, body)
where not exists (
  select 1 from notification_templates t where t.event = v.event::notif_event and t.channel = 'whatsapp'
);
