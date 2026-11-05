-- ============================================================================
-- 0041  Commission is added to the customer's price (not taken from the vendor)
-- ----------------------------------------------------------------------------
--  Before: the customer paid the vendor's price; the platform's commission was
--  deducted from the vendor's payout.
--  Now:    the customer pays the vendor's price + the commission; the vendor is
--          paid their own price in full.
--
--    ₦200 shirt, 30% commission  →  customer pays ₦260, vendor receives ₦200.
--
--  • The rate is snapshotted on each order when it's placed
--    (orders.commission_markup, from the default plan). Orders placed before
--    this migration have NULL there and keep the old rules to the end.
--  • order_items.price_at_checkin stays the VENDOR's price; customer_price is
--    price × (1 + rate), rounded to the whole naira.
--  • Express and premium markups are % of the VENDOR's price (items + extras),
--    still kept by the platform.
--  • Delivery fee, premium extras (admin-priced) and the re-delivery penalty
--    get no commission.
--  • Promo discounts come off the customer's subtotal. A vendor-funded promo
--    costs the vendor only its share (vendor subtotal ÷ customer subtotal) —
--    the platform gives up the rest, as it did when commission was deducted.
--  • The platform-funded bulk discount never touches the vendor.
--  • orders.vendor_earnings is what the vendor receives for the order; the
--    payout is that amount with fee 0.
-- ============================================================================

alter table orders add column if not exists commission_markup numeric(5,4);
alter table orders add column if not exists vendor_items_total numeric(12,2) not null default 0;
alter table orders add column if not exists commission_total numeric(12,2) not null default 0;
alter table orders add column if not exists vendor_earnings numeric(12,2) not null default 0;
alter table order_items add column if not exists customer_price numeric(12,2);

comment on column orders.commission_markup is
  'Commission rate added on top of the vendor''s item prices for this order (snapshot at creation). NULL = placed before 0041: commission was deducted from the vendor payout.';
comment on column orders.vendor_items_total is 'Sum of the vendor''s own item prices.';
comment on column orders.commission_total is 'Commission added to the customer''s item prices (items_total − vendor_items_total).';
comment on column orders.vendor_earnings is 'What the vendor receives for this order.';
comment on column order_items.customer_price is 'What the customer pays for this item: price_at_checkin × (1 + order commission_markup).';

-- ─── 1. Snapshot the rate on new orders; nobody can change it afterwards ─────
create or replace function current_commission_rate() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select vp.commission_rate from vendor_plans vp
                    where vp.is_default and vp.active limit 1), 0);
$$;
revoke execute on function current_commission_rate() from public, anon;
grant execute on function current_commission_rate() to authenticated;

create or replace function set_order_commission_markup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.commission_markup := current_commission_rate();
  else
    new.commission_markup := old.commission_markup;
  end if;
  return new;
end;
$$;
revoke execute on function set_order_commission_markup() from public, anon, authenticated;

create or replace trigger orders_commission_markup
  before insert or update on orders
  for each row execute function set_order_commission_markup();

-- ─── 2. Customer price per item ─────────────────────────────────────────────
-- Runs after order_items_assign_subcode (BEFORE triggers fire by name), which
-- fills price_at_checkin from the price list.
create or replace function set_item_customer_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare rate numeric(5,4);
begin
  select commission_markup into rate from orders where id = new.order_id;
  if rate is null then
    new.customer_price := new.price_at_checkin;                      -- old order: no markup
  else
    new.customer_price := round(coalesce(new.price_at_checkin, 0) * (1 + rate), 0);
  end if;
  return new;
end;
$$;
revoke execute on function set_item_customer_price() from public, anon, authenticated;

create or replace trigger order_items_customer_price
  before insert or update on order_items
  for each row execute function set_item_customer_price();

-- ─── 3. Order totals ────────────────────────────────────────────────────────
create or replace function recompute_order(oid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  items numeric(12,2); v_items numeric(12,2); extras numeric(12,2);
  subtotal numeric(12,2); v_sub numeric(12,2);
  ex_pct numeric(5,4) := 0; pr_pct numeric(5,4) := 0;
  ex_fee numeric(12,2) := 0; pr_fee numeric(12,2) := 0;
  disc numeric(12,2) := 0; charge numeric(12,2);
  item_count int := 0;
  b_min int := 0; b_pct numeric(5,4) := 0; bulk numeric(12,2) := 0;
  v_disc numeric(12,2) := 0; earn numeric(12,2); rate numeric(5,4);
begin
  select * into o from orders where id = oid;
  if o.id is null then return; end if;

  select coalesce(sum(coalesce(customer_price, price_at_checkin)), 0),
         coalesce(sum(price_at_checkin), 0), count(*)
    into items, v_items, item_count
    from order_items where order_id = oid;
  select coalesce(sum(price), 0) into extras from order_extras where order_id = oid;
  subtotal := items + extras;      -- what the customer pays for the work
  v_sub    := v_items + extras;    -- the vendor's own price for it

  select express_pct, premium_pct, bulk_min_items, bulk_discount_pct
    into ex_pct, pr_pct, b_min, b_pct
    from platform_settings where id = true;

  -- express / premium: a % of the vendor's price, kept by the platform
  if o.turnaround = 'express'   then ex_fee := round(v_sub * coalesce(ex_pct, 0), 2); end if;
  if o.service_tier = 'premium' then pr_fee := round(v_sub * coalesce(pr_pct, 0), 2); end if;

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

  -- What the vendor receives.
  if o.commission_markup is null then
    -- placed before 0041: commission comes off the vendor's gross (as the payout does)
    earn := v_items + extras + o.delivery_fee;
    if o.discount_vendor_funded then earn := greatest(earn - disc, 0); end if;
    rate := current_commission_rate();
    earn := earn - round(earn * coalesce(rate, 0), 2);
  else
    earn := v_sub + o.delivery_fee;
    if o.discount_vendor_funded and disc > 0 then
      -- the vendor funds its share of the promo; the platform funds the commission's share
      v_disc := case when subtotal > 0 then round(disc * v_sub / subtotal, 2) else disc end;
      earn := greatest(earn - v_disc, 0);
    end if;
  end if;

  update orders
    set items_total = items, extras_total = extras,
        vendor_items_total = v_items,
        commission_total = items - v_items,
        express_fee = ex_fee, premium_fee = pr_fee,
        discount = disc, bulk_discount = bulk,
        total = charge - disc - bulk,
        vendor_earnings = earn
  where id = oid;
end;
$$;

-- ─── 4. Payouts: the vendor gets their price in full ────────────────────────
create or replace function schedule_payout_if_ready(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; paid boolean; rate numeric(5,4); fee numeric(12,2) := 0;
  vendor_gross numeric(12,2); delay int := 0;
begin
  select * into o from orders where id = p_order;
  if o.status <> 'closed' then return; end if;
  select exists(select 1 from payments where order_id = p_order and status = 'succeeded') into paid;
  if not paid then return; end if;
  if exists (select 1 from payouts where p_order = any(order_ids)) then return; end if;

  if o.commission_markup is null then
    -- placed before 0041: items + extras + delivery, less a vendor-funded discount,
    -- less the global commission
    vendor_gross := o.items_total + o.extras_total + o.delivery_fee;
    if o.discount_vendor_funded then
      vendor_gross := greatest(vendor_gross - o.discount, 0);
    end if;
    rate := current_commission_rate();
    fee := round(vendor_gross * coalesce(rate, 0), 2);
  else
    -- commission was added to the customer's price: the vendor keeps everything
    -- they earned (their prices + extras + delivery, less their promo share)
    vendor_gross := o.vendor_earnings;
    fee := 0;
  end if;

  select coalesce((select payout_delay_hours from platform_settings where id), 0) into delay;

  insert into payouts (vendor_id, order_ids, gross, fee, net, due_at, status)
  values (
    o.vendor_id, array[p_order], vendor_gross, fee, vendor_gross - fee,
    greatest(now(), coalesce(o.completed_at, now()) + make_interval(hours => delay)),
    'due'
  );
end;
$$;
revoke execute on function schedule_payout_if_ready(uuid) from public, anon, authenticated;

-- ─── 5. Ledger: vendor earnings per order ───────────────────────────────────
-- Same columns as 0033, plus vendor_earnings at the end.
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
  exists (select 1 from payments pm where pm.order_id = o.id and pm.status = 'succeeded') as is_paid,
  o.branch_id,
  b.name as branch_name,
  o.vendor_earnings
from orders o
join vendors v on v.id = o.vendor_id
join profiles p on p.id = o.customer_id
left join branches b on b.id = o.branch_id
where o.customer_id = auth.uid() or can_staff_branch(o.vendor_id, o.branch_id) or is_admin();
revoke all on order_summaries from anon;

-- ─── 6. Public profile: show customer prices ────────────────────────────────
create or replace function get_vendor_profile(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id,
    'slug', v.slug,
    'name', v.name,
    'status', v.status,
    'kyc_verified', v.kyc_verified,
    'address_line', v.address_line,
    'area', v.area,
    'city', v.city,
    'delivery', v.delivery,
    'service_radius_km', v.service_radius_km,
    'opens_at', v.opens_at,
    'closes_at', v.closes_at,
    'is_open', v.is_open,
    'member_since', v.created_at,
    'completed_orders', (select count(*) from orders o where o.vendor_id = v.id and o.status = 'closed'),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'name', b.name, 'is_main', b.is_main, 'address_line', b.address_line,
               'area', b.area, 'city', b.city, 'phone', b.phone, 'opens_at', b.opens_at,
               'closes_at', b.closes_at, 'is_open', b.is_open)
             order by b.is_main desc, b.name)
        from branches b where b.vendor_id = v.id and b.active), '[]'::jsonb),
    'rating', (
      select jsonb_build_object(
        'avg', coalesce(round(avg(r.rating)::numeric, 1), 0),
        'count', count(*),
        'dist', jsonb_build_object(
          '5', count(*) filter (where r.rating = 5),
          '4', count(*) filter (where r.rating = 4),
          '3', count(*) filter (where r.rating = 3),
          '2', count(*) filter (where r.rating = 2),
          '1', count(*) filter (where r.rating = 1)))
      from reviews r where r.vendor_id = v.id),
    'reviews', coalesce((
      select jsonb_agg(x order by x.created_at desc)
      from (
        select r.rating, r.comment, r.created_at,
               trim(split_part(btrim(coalesce(p.full_name, '')), ' ', 1) || ' ' ||
                    coalesce(left(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 2), ''), 1) || '.', '')) as reviewer
          from reviews r
          left join profiles p on p.id = r.customer_id
         where r.vendor_id = v.id
         order by r.created_at desc
         limit 12
      ) x), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object('item', it.name, 'service', pl.service,
                                          'price', round(pl.price * (1 + current_commission_rate()), 0))
                       order by it.name, pl.service)
        from price_list pl
        join item_types it on it.id = pl.item_type_id
       where pl.vendor_id = v.id and pl.active and it.active), '[]'::jsonb)
  )
  from vendors v
  where v.slug = lower(btrim(p_slug))
    and v.status in ('verified', 'pending');
$$;
revoke execute on function get_vendor_profile(text) from public;
grant execute on function get_vendor_profile(text) to anon, authenticated;

-- ─── 7. Backfill: fill the new columns on existing orders (old rules) ───────
update order_items set customer_price = price_at_checkin where customer_price is null;
do $$
declare r record;
begin
  for r in select id from orders loop
    perform recompute_order(r.id);
  end loop;
end $$;
