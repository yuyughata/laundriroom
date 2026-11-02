-- ═══════════════════════════════════════════════════════════════════════════
-- 0025 — Notification event: support replied to a customer's ticket.
-- (New enum values must be committed before use; the rule is added in 0026.)
-- ═══════════════════════════════════════════════════════════════════════════

alter type notif_event add value if not exists 'ticket_reply';
