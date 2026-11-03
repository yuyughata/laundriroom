-- ═══════════════════════════════════════════════════════════════════════════
-- 0035 — Optional distance-based delivery fees (Google Maps).
--
-- Admin → Fees & charges picks how the delivery fee is worked out:
--   'flat'     — the existing flat fee (delivery_fee_rules, scope global).
--   'distance' — base fare + per-km rate × the driving distance from the
--                branch to the customer's address (Google Maps Distance
--                Matrix), never below the minimum fee — like a ride-hailing
--                fare. If the distance can't be found (no API key, address
--                not on the map…) the flat fee is used instead.
-- The fee is worked out by the app server when the order is placed and
-- stored on the order as before (orders.delivery_fee); the distance used is
-- kept in orders.delivery_distance_km. orders.pickup_address_id holds the
-- customer's address for pickup and delivery.
-- ═══════════════════════════════════════════════════════════════════════════

alter table platform_settings
  add column if not exists delivery_pricing     text          not null default 'flat',
  add column if not exists delivery_per_km      numeric(12,2) not null default 0,
  add column if not exists delivery_base_fare   numeric(12,2) not null default 0,
  add column if not exists delivery_min_fee     numeric(12,2) not null default 0;
alter table platform_settings drop constraint if exists delivery_pricing_mode;
alter table platform_settings add constraint delivery_pricing_mode
  check (delivery_pricing in ('flat', 'distance')
         and delivery_per_km >= 0 and delivery_base_fare >= 0 and delivery_min_fee >= 0);
comment on column platform_settings.delivery_pricing is 'flat = flat delivery fee; distance = base + per-km × driving km (Google Maps), min fee, flat fallback.';

alter table orders add column if not exists delivery_distance_km numeric(6,1);
comment on column orders.delivery_distance_km is 'Driving km used to price the delivery (distance pricing); null for flat pricing.';
comment on column orders.pickup_address_id is 'The customer''s address, used for pickup and/or delivery.';
