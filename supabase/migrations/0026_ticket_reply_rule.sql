-- ═══════════════════════════════════════════════════════════════════════════
-- 0026 — Tell the customer when support replies to their ticket, by email and
-- WhatsApp. Fired from admin/support/actions.ts → replyTicket with
-- { event: 'ticket_reply', ticket_id }; recipient 'customer' resolves to the
-- ticket's customer, and the excerpt is the latest support message.
-- ═══════════════════════════════════════════════════════════════════════════

insert into notification_rules (event, channels, fallback_order, recipients, enabled)
select 'ticket_reply', '{email,whatsapp}'::notif_channel[], '{whatsapp,email}'::notif_channel[], '{customer}'::text[], true
where not exists (select 1 from notification_rules where event = 'ticket_reply');

insert into notification_templates (event, channel, subject, body)
select 'ticket_reply', 'whatsapp', null,
       'laundriroom support replied to your ticket #{{ticket_number}} "{{subject}}": {{message_excerpt}} View and reply: {{customer_ticket_url}}'
where not exists (select 1 from notification_templates where event = 'ticket_reply' and channel = 'whatsapp');
