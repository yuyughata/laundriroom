-- ═══════════════════════════════════════════════════════════════════════════
-- 0040 — Finances are for the business's manager only.
--
-- The ledger (income, expenses), payouts and the payout bank account were
-- readable by every staff member of the vendor. Now only a business-wide
-- manager (is_vendor_manager) and laundriroom admins can read them;
-- attendants, riders and branch managers can't. Writes were already
-- manager/admin-only.
--
-- Staff are added from Vendor → Team (or Admin → Vendors → a vendor) by the
-- app's server, which uses the service key to invite the person by email and
-- set their role; vendor_memberships writes stay manager/admin-only.
--
-- Uses ALTER POLICY so it can be applied to the live project as-is.
-- ═══════════════════════════════════════════════════════════════════════════

alter policy ledger_read on ledger_entries
  using (is_vendor_manager(vendor_id) or is_admin());

alter policy payouts_read on payouts
  using (is_vendor_manager(vendor_id) or is_admin());

alter policy payout_acct_read on vendor_payout_accounts
  using (is_vendor_manager(vendor_id) or is_admin());
