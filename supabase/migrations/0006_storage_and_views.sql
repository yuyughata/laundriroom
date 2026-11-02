-- ============================================================================
-- 0006  Storage buckets and convenience views
-- ============================================================================

-- ─── Storage buckets ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('item-photos',  'item-photos',  false),
  ('vendor-docs',  'vendor-docs',  false),
  ('invoices',     'invoices',     false)
on conflict (id) do nothing;

-- Item photos: vendor staff of the order's vendor may read/write; the customer
-- on the order may read. Path convention: item-photos/{order_id}/{item_id}.jpg
create policy "item photos read" on storage.objects for select
  using (
    bucket_id = 'item-photos' and exists (
      select 1 from orders o
      where o.id::text = split_part(name, '/', 1)
        and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_admin())
    )
  );
create policy "item photos write" on storage.objects for insert
  with check (
    bucket_id = 'item-photos' and exists (
      select 1 from orders o
      where o.id::text = split_part(name, '/', 1) and is_vendor_staff(o.vendor_id)
    )
  );

-- Vendor docs: that vendor's managers and admins.
create policy "vendor docs rw" on storage.objects for all
  using (
    bucket_id = 'vendor-docs' and (
      is_platform_admin() or is_vendor_manager((split_part(name, '/', 1))::uuid)
    )
  )
  with check (
    bucket_id = 'vendor-docs' and (
      is_platform_admin() or is_vendor_manager((split_part(name, '/', 1))::uuid)
    )
  );

-- Invoices: the order's parties.
create policy "invoices read" on storage.objects for select
  using (
    bucket_id = 'invoices' and exists (
      select 1 from orders o
      where o.id::text = split_part(name, '/', 1)
        and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_admin())
    )
  );

-- ─── Views ──────────────────────────────────────────────────────────────────
-- A flat order summary for list screens (respects RLS of the underlying tables).
create or replace view order_summaries as
select
  o.id,
  o.code,
  o.status,
  o.entry_mode,
  o.return_mode,
  o.payment_timing,
  o.service_tier,
  o.turnaround,
  o.total,
  o.delivery_fee,
  o.created_at,
  o.ready_at,
  o.closed_at,
  o.vendor_id,
  v.name as vendor_name,
  o.customer_id,
  p.full_name as customer_name,
  (select count(*) from order_items oi where oi.order_id = o.id) as item_count,
  exists (select 1 from payments pm where pm.order_id = o.id and pm.status = 'succeeded') as is_paid
from orders o
join vendors v on v.id = o.vendor_id
join profiles p on p.id = o.customer_id;

-- Vendor daily takings (income ledger), for the vendor ledger screen.
create or replace view vendor_daily_takings as
select vendor_id,
       (created_at at time zone 'Africa/Lagos')::date as day,
       sum(case when type = 'income' then amount else 0 end) as income,
       sum(case when type = 'expense' then amount else 0 end) as expense
from ledger_entries
group by vendor_id, (created_at at time zone 'Africa/Lagos')::date;
