-- ═══════════════════════════════════════════════════════════════════════════
-- 0027 — Notification event: a customer placed a new order.
-- (New enum values must be committed before use; the rule is added in 0028.)
-- ═══════════════════════════════════════════════════════════════════════════

alter type notif_event add value if not exists 'order_placed';
