-- ============================================================================
-- 0009  Customer reviews & ratings
-- A customer can leave one rating (1–5) and an optional comment per completed
-- order. Ratings aggregate per vendor and are visible across the app so
-- customers can compare laundries.
-- ============================================================================

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references orders (id) on delete cascade,  -- one review per order
  customer_id uuid not null references profiles (id),
  vendor_id   uuid not null references vendors (id),
  rating      int not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);
create index reviews_vendor_idx on reviews (vendor_id, created_at desc);
create index reviews_customer_idx on reviews (customer_id, created_at desc);

-- Aggregate rating per vendor, for display on vendor cards and dashboards.
create or replace view vendor_ratings as
select
  vendor_id,
  round(avg(rating)::numeric, 2) as avg_rating,
  count(*) as review_count
from reviews
group by vendor_id;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table reviews enable row level security;

-- Reviews are visible to any signed-in user (ratings help customers choose).
create policy reviews_read on reviews for select using (auth.uid() is not null);

-- A customer can review only their own order, and only once it's completed.
create policy reviews_insert on reviews for insert
  with check (
    customer_id = auth.uid() and
    exists (
      select 1 from orders o
      where o.id = order_id
        and o.customer_id = auth.uid()
        and o.vendor_id = vendor_id
        and o.status = 'closed'
    )
  );

-- Admins can moderate (e.g. remove abusive content).
create policy reviews_admin_all on reviews for all
  using (is_platform_admin()) with check (is_platform_admin());
