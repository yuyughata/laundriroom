-- ============================================================================
-- seed.sql — demo data for local development (runs on `supabase db reset`).
-- This is NOT applied to production. It creates one demo vendor, its catalogue
-- prices, and a batch of tags, so you can click through the app immediately.
--
-- Demo user accounts (customer, attendant, admin) are created through the app's
-- sign-up / the Supabase dashboard, because users live in auth.users. After you
-- create them, run scripts/seed-demo-roles.sql (see docs) to assign roles and
-- vendor membership. See docs/CONNECT-DATABASE.md.
-- ============================================================================

-- A demo vendor (verified and open) on the default plan.
with plan as (select id from vendor_plans where is_default limit 1)
insert into vendors (id, name, status, delivery, plan_id, address_line, area, city, lat, lng, service_radius_km, opens_at, closes_at, is_open)
select
  '00000000-0000-0000-0000-00000000f01d',
  'Fold & Press, Rayfield',
  'verified',
  'both',
  plan.id,
  '12 Yakubu Gowon Way', 'Rayfield', 'Jos',
  9.8530, 8.9010, 8, '07:00', '18:00', true
from plan
on conflict (id) do nothing;

-- Price list for the demo vendor across the global catalogue.
insert into price_list (vendor_id, item_type_id, service, price)
select '00000000-0000-0000-0000-00000000f01d', it.id, s.service, s.price
from item_types it
cross join lateral (
  values
    ('wash_and_fold'::service_type, 800),
    ('dry_clean'::service_type, 2500),
    ('press_only'::service_type, 500)
) as s(service, price)
where it.is_global
on conflict (vendor_id, item_type_id, service) do nothing;

-- A batch of 50 pre-printed tags for the demo vendor.
insert into tags (code, batch, status, vendor_id)
select 'FP-' || lpad(g::text, 4, '0'), 'BATCH-A', 'free', '00000000-0000-0000-0000-00000000f01d'
from generate_series(1, 50) g
on conflict (code) do nothing;
