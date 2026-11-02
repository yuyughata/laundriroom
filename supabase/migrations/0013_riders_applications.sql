-- ============================================================================
-- 0013  Rider assignment + vendor self-serve applications
-- Riders are assigned by the vendor/attendant and given the order's code; the
-- vendor manages delivery status in the app (no rider login needed).
-- ============================================================================

-- ─── Rider assignment on an order ───────────────────────────────────────────
alter table orders add column rider_name text;
alter table orders add column rider_phone text;

-- ─── Vendor self-serve applications ─────────────────────────────────────────
create type application_status as enum ('pending', 'approved', 'rejected');

create table vendor_applications (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated always as identity,
  business_name text not null,
  contact_name  text not null,
  email         text not null,
  phone         text not null,
  area          text,
  city          text,
  delivery      delivery_mode not null default 'own_riders',
  message       text,
  status        application_status not null default 'pending',
  vendor_id     uuid references vendors (id),       -- set when approved
  reviewed_by   uuid references profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger vendor_applications_updated before update on vendor_applications
  for each row execute function set_updated_at();

alter table vendor_applications enable row level security;

-- Anyone (including an unauthenticated visitor) may submit an application.
grant insert on vendor_applications to anon, authenticated;
create policy applications_public_insert on vendor_applications for insert with check (true);
-- Only admins read and decide on them.
create policy applications_admin_read on vendor_applications for select using (is_admin());
create policy applications_admin_update on vendor_applications for update using (is_platform_admin()) with check (is_platform_admin());
