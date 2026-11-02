-- ============================================================================
-- 0017  Automated Paystack payouts
-- ----------------------------------------------------------------------------
--  • vendor_payout_accounts: the bank account each vendor is paid into, plus the
--    Paystack transfer-recipient code once created.
--  • payouts: transfer bookkeeping (transfer_code, failure_reason, processed_at)
--    and a 'processing' status for a transfer that's been initiated but not yet
--    confirmed by webhook.
-- The process-payouts edge function initiates transfers for due payouts; the
-- paystack-webhook settles them to sent/failed.
-- ============================================================================

-- A transfer that has been sent to Paystack but not yet confirmed.
alter type payout_status add value if not exists 'processing';

alter table payouts add column transfer_code  text;        -- Paystack TRF_...
alter table payouts add column failure_reason text;        -- why a transfer could not be made/failed
alter table payouts add column processed_at   timestamptz; -- when the transfer was initiated

create table vendor_payout_accounts (
  vendor_id      uuid primary key references vendors (id) on delete cascade,
  bank_code      text not null,
  bank_name      text,
  account_number text not null,
  account_name   text,                       -- resolved from Paystack, or entered
  recipient_code text,                        -- Paystack RCP_... (created lazily)
  created_by     uuid references profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger vendor_payout_accounts_updated before update on vendor_payout_accounts
  for each row execute function set_updated_at();

alter table vendor_payout_accounts enable row level security;

-- Vendor staff see their own account; the manager sets it; admins manage all.
create policy payout_acct_read on vendor_payout_accounts for select
  using (is_vendor_staff(vendor_id) or is_admin());
create policy payout_acct_manager_write on vendor_payout_accounts for all
  using (is_vendor_manager(vendor_id) or is_platform_admin())
  with check (is_vendor_manager(vendor_id) or is_platform_admin());
