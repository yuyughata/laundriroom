-- ═══════════════════════════════════════════════════════════════════════════
-- 0037 — Notification events for review quality (values only; the rules that
-- use them are in 0038, since Postgres can't use a new enum value in the same
-- transaction that adds it).
--   review_low        a 1–2★ review: tell the vendor (and admins)
--   vendor_inquiry    admin asks the vendor what's going on
--   vendor_warning    admin warns the vendor
--   vendor_suspended  admin suspends the vendor for repeated bad reviews
-- ═══════════════════════════════════════════════════════════════════════════
alter type notif_event add value if not exists 'review_low';
alter type notif_event add value if not exists 'vendor_inquiry';
alter type notif_event add value if not exists 'vendor_warning';
alter type notif_event add value if not exists 'vendor_suspended';
