-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 — Notification events for support tickets (admin alerts).
-- (New enum values must be committed before use; rules are added in 0024.)
-- ═══════════════════════════════════════════════════════════════════════════

alter type notif_event add value if not exists 'ticket_opened';
alter type notif_event add value if not exists 'ticket_message';
