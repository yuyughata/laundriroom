-- ============================================================================
-- 0005  Application defaults
-- Rows the platform always needs: notification rules + templates for every
-- event, a default vendor plan, the global item catalogue, and a global
-- delivery-fee rule. These are real defaults, not demo data.
-- ============================================================================

-- ─── Default vendor plan ────────────────────────────────────────────────────
insert into vendor_plans (name, type, commission_rate, monthly_fee, is_default, active)
values ('Standard commission', 'commission', 0.1500, 0, true, true);

-- ─── Global item catalogue ──────────────────────────────────────────────────
insert into item_types (name, icon, is_global) values
  ('Shirt',        'shirt',   true),
  ('Trousers',     'pants',   true),
  ('Dress',        'dress',   true),
  ('Suit (2-pc)',  'suit',    true),
  ('Agbada',       'robe',    true),
  ('Native (set)', 'robe',    true),
  ('Bedsheet',     'bed',     true),
  ('Duvet',        'duvet',   true),
  ('Curtain',      'curtain', true),
  ('Towel',        'towel',   true);

-- ─── Global flat delivery fee (admin can override per zone/vendor) ───────────
insert into delivery_fee_rules (scope, type, flat_amount, active)
values ('global', 'flat', 1500, true);

-- ─── Notification rules: one row per event ──────────────────────────────────
-- Email + WhatsApp on at pilot; SMS is built but stays out of the channel list
-- until its provider is configured under Admin → Integrations.
insert into notification_rules (event, channels, fallback_order, recipients, enabled) values
  ('order_confirmed',            '{email,whatsapp}', '{whatsapp,email}', '{customer}',        true),
  ('pickup_assigned',            '{whatsapp}',       '{whatsapp,email}', '{customer,rider}',  true),
  ('checked_in',                 '{whatsapp,email}', '{whatsapp,email}', '{customer}',        true),
  ('stage_complete',             '{}',               '{whatsapp,email}', '{customer}',        false),
  ('ready_for_delivery',         '{whatsapp,email}', '{whatsapp,email}', '{customer}',        true),
  ('out_for_delivery',           '{whatsapp,email}', '{whatsapp,email}', '{customer}',        true),
  ('payment_due',                '{email,whatsapp}', '{whatsapp,email}', '{customer}',        true),
  ('payment_received',           '{email}',          '{whatsapp,email}', '{customer,vendor}', true),
  ('order_closed',               '{email}',          '{whatsapp,email}', '{customer}',        true),
  ('item_type_requested',        '{email}',          '{email}',          '{vendor}',          true),
  ('item_type_approved',         '{email}',          '{email}',          '{vendor}',          true),
  ('payout_sent',                '{email}',          '{email}',          '{vendor}',          true),
  ('email_verification',         '{email}',          '{email}',          '{customer}',        true),
  ('email_verification_reminder','{email}',          '{email}',          '{customer}',        true);

-- ─── Notification templates (email + whatsapp where used) ───────────────────
insert into notification_templates (event, channel, subject, body) values
  ('order_confirmed',    'email',    'Your laundriroom order {{order_code}} is confirmed',
     'Hi {{customer_name}}, we have your order {{order_code}}. Track it any time in the app.'),
  ('order_confirmed',    'whatsapp', null,
     'laundriroom: order {{order_code}} confirmed. Track it in the app: {{track_url}}'),
  ('checked_in',         'email',    'We have your laundry — {{order_code}}',
     '{{item_count}} item(s) checked in and tagged. Total {{total}}.'),
  ('checked_in',         'whatsapp', null,
     'laundriroom: {{item_count}} item(s) checked in for {{order_code}}. Total {{total}}.'),
  ('ready_for_delivery', 'email',    'Your laundry is ready — {{order_code}}',
     'Your order {{order_code}} is ready. {{return_line}}'),
  ('ready_for_delivery', 'whatsapp', null,
     'laundriroom: {{order_code}} is ready. {{return_line}}'),
  ('out_for_delivery',   'email',    'Your laundry is out for delivery',
     'Your order {{order_code}} is on its way. {{pay_line}}'),
  ('out_for_delivery',   'whatsapp', null,
     'laundriroom: {{order_code}} is out for delivery. {{pay_line}}'),
  ('payment_due',        'email',    'Payment for {{order_code}}',
     'Amount due: {{total}}. Pay securely in the app: {{pay_url}}'),
  ('payment_received',   'email',    'Payment received — {{order_code}}',
     'We received {{total}} for {{order_code}}. Thank you.'),
  ('order_closed',       'email',    'Order complete — {{order_code}}',
     'Your order {{order_code}} is complete. Your invoice is attached in the app.'),
  ('email_verification', 'email',    'Verify your email for laundriroom',
     'Welcome to laundriroom. Please verify your email to secure your account: {{verify_url}}'),
  ('email_verification_reminder', 'email', 'Reminder: verify your laundriroom email',
     'A quick reminder to verify your email so you do not miss order updates: {{verify_url}}');

-- ─── Fees & charges + premium extras ───────────────────────────────────────
-- Sample percentages (admin edits these under Fees & charges). Fractions:
-- 0.2000 = 20%. Express and premium are platform markups; the non-collection
-- penalty is a share of the delivery fee charged when a delivery is rescheduled.
insert into platform_settings (id, express_pct, premium_pct, noncollection_penalty_pct)
values (true, 0.2000, 0.1500, 0.5000)
on conflict (id) do nothing;

insert into service_extras (name, description, price, active) values
  ('Premium detergent',      'Hypoallergenic, high-end detergent',                1000, true),
  ('Hand finishing & press', 'Garment-by-garment hand finishing',                 1500, true),
  ('Stain treatment',        'Targeted pre-treatment for tough stains',           1200, true),
  ('Fabric softener & scent','Premium softener with a long-lasting scent',         800, true),
  ('Delicate hand-wash',     'Gentle hand-wash for delicate fabrics',             2000, true);

-- ─── Integration rows (all start not configured) ────────────────────────────
insert into integration_settings (provider, status, config) values
  ('resend',   'not_configured', '{"from":"laundriroom <notifications@laundriroom.example>"}'),
  ('whatsapp', 'not_configured', '{"phone_id":""}'),
  ('sms',      'not_configured', '{"sender_id":"LAUNDRIROOM"}');
