-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Notification events for account & security emails.
-- (New enum values must be committed before they're used, so the rules that
-- use them are added in 0022.)
-- ═══════════════════════════════════════════════════════════════════════════

alter type notif_event add value if not exists 'password_changed';
alter type notif_event add value if not exists 'account_updated';
alter type notif_event add value if not exists 'account_suspended';
alter type notif_event add value if not exists 'account_reactivated';
