-- 0053_welcome_email.sql
--
-- Branded "Welcome to laundriroom" email sent to a new customer on sign-up,
-- through the app's own Resend pipeline (send-notification, user_id event) —
-- independent of Supabase Auth's confirm-email toggle, and best-effort so it
-- never blocks sign-up. Template lives in src/lib/emails.ts (mirrored to
-- supabase/functions/_shared/emails.ts); this adds the event + its rule.

alter type notif_event add value if not exists 'account_welcome';

insert into notification_rules (event, channels, fallback_order, recipients, enabled)
values ('account_welcome', '{email}', '{email}', array['user'], true)
on conflict (event) do update
  set channels = excluded.channels,
      fallback_order = excluded.fallback_order,
      recipients = excluded.recipients,
      enabled = true;
