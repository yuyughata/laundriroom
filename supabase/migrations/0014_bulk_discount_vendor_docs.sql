-- ============================================================================
-- 0014  Platform-funded bulk-order discount  +  vendor verification documents
-- ----------------------------------------------------------------------------
--  • Bulk discount: when an order has at least N items, a % comes off the items
--    subtotal. It is PLATFORM-funded — it reduces the customer's total but never
--    the vendor's payout (schedule_payout_if_ready only ever subtracts a
--    vendor-funded discount from the vendor gross).
--  • Vendor documents: after a seamless onboarding, a vendor uploads ID + CAC
--    certificate for verification; admins review and mark the vendor KYC-verified.
-- ============================================================================

-- ─── Bulk discount settings (platform-wide) ─────────────────────────────────
alter table platform_settings add column bulk_min_items    int          not null default 0;  -- 0 = disabled
alter table platform_settings add column bulk_discount_pct numeric(5,4) not null default 0;  -- 0.0200 = 2%

-- Per-order snapshot of the platform-funded bulk discount applied.
alter table orders add column bulk_discount numeric(12,2) not null default 0;

-- ─── Recompute totals, now including the bulk discount ──────────────────────
create or replace function recompute_order(oid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  items numeric(12,2); extras numeric(12,2); subtotal numeric(12,2);
  ex_pct numeric(5,4) := 0; pr_pct numeric(5,4) := 0;
  ex_fee numeric(12,2) := 0; pr_fee numeric(12,2) := 0;
  disc numeric(12,2) := 0; charge numeric(12,2);
  item_count int := 0;
  b_min int := 0; b_pct numeric(5,4) := 0; bulk numeric(12,2) := 0;
begin
  select * into o from orders where id = oid;
  if o.id is null then return; end if;

  select coalesce(sum(price_at_checkin), 0), count(*) into items, item_count
    from order_items where order_id = oid;
  select coalesce(sum(price), 0) into extras from order_extras where order_id = oid;
  subtotal := items + extras;

  select express_pct, premium_pct, bulk_min_items, bulk_discount_pct
    into ex_pct, pr_pct, b_min, b_pct
    from platform_settings where id = true;

  if o.turnaround = 'express'   then ex_fee := round(subtotal * coalesce(ex_pct, 0), 2); end if;
  if o.service_tier = 'premium' then pr_fee := round(subtotal * coalesce(pr_pct, 0), 2); end if;

  -- promo / manual discount (vendor- or platform-funded; set elsewhere)
  if o.discount_type = 'percent' then
    disc := round(subtotal * coalesce(o.discount_value, 0) / 100, 2);
    if o.discount_max is not null then disc := least(disc, o.discount_max); end if;
  elsif o.discount_type = 'fixed' then
    disc := coalesce(o.discount_value, 0);
  end if;

  -- platform-funded bulk discount: qualifies on item count, comes off the items subtotal
  if b_min > 0 and item_count >= b_min then
    bulk := round(items * coalesce(b_pct, 0), 2);
  end if;

  charge := subtotal + o.delivery_fee + ex_fee + pr_fee + o.reschedule_penalty;
  disc := least(disc, charge);
  bulk := least(bulk, charge - disc);        -- never drive the total below zero

  update orders
    set items_total = items, extras_total = extras,
        express_fee = ex_fee, premium_fee = pr_fee,
        discount = disc, bulk_discount = bulk,
        total = charge - disc - bulk
  where id = oid;
end;
$$;

-- ─── Vendor verification documents (post-onboarding KYC) ─────────────────────
alter table vendors add column kyc_verified boolean not null default false;

create type vendor_doc_type as enum ('id', 'cac', 'other');

create table vendor_documents (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references vendors (id) on delete cascade,
  type          vendor_doc_type not null,
  file_path     text not null,                         -- storage path in the vendor-docs bucket
  original_name text,
  status        application_status not null default 'pending',   -- enum from 0013
  note          text,                                  -- admin note on rejection
  uploaded_by   uuid references profiles (id),
  reviewed_by   uuid references profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on vendor_documents (vendor_id);
create trigger vendor_documents_updated before update on vendor_documents
  for each row execute function set_updated_at();

alter table vendor_documents enable row level security;

-- Vendor staff manage their own vendor's documents; admins see & review all.
create policy vendor_docs_read on vendor_documents for select
  using (is_vendor_staff(vendor_id) or is_admin());
create policy vendor_docs_insert on vendor_documents for insert
  with check (is_vendor_staff(vendor_id));
create policy vendor_docs_admin_update on vendor_documents for update
  using (is_platform_admin()) with check (is_platform_admin());

-- Private bucket for the document files (same path convention as receipts:
-- vendor-docs/{vendor_id}/{filename}).
insert into storage.buckets (id, name, public) values ('vendor-docs', 'vendor-docs', false)
on conflict (id) do nothing;

create policy "vendor-docs rw" on storage.objects for all
  using (
    bucket_id = 'vendor-docs' and (
      is_platform_admin() or is_vendor_staff((split_part(name, '/', 1))::uuid)
    )
  )
  with check (
    bucket_id = 'vendor-docs' and (
      is_platform_admin() or is_vendor_staff((split_part(name, '/', 1))::uuid)
    )
  );
