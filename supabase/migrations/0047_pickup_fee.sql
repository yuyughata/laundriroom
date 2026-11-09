-- ═══════════════════════════════════════════════════════════════════════════
-- 0047  Pickup fee
--   "Pick up from me" now costs the same as "Deliver to me": a trip to the
--   customer's address, priced the same way (flat fee, or by distance from the
--   branch). An order that is both picked up and delivered pays both — two
--   trips. The app sets orders.pickup_fee at creation (quoteDelivery, branch →
--   the pickup address) just as it sets delivery_fee.
--
--   The order total and the vendor's earnings/payout mirror delivery_fee
--   exactly: added to what the customer pays, and kept by the vendor (its
--   rider makes the trip). recompute_order is the one place the total is
--   worked out, so adding pickup_fee there flows everywhere. The non-
--   collection penalty stays a % of delivery_fee only (it's about delivery).
-- Drop-free; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table orders add column if not exists pickup_fee numeric(12,2) not null default 0;      -- snapshot at creation
alter table orders add column if not exists pickup_distance_km numeric(6,1);

-- Totals: customer pays items + extras + delivery + pickup + markups + penalty,
-- less discounts; the vendor keeps their price + extras + delivery + pickup.
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
  trips numeric(12,2);
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
  trips    := o.delivery_fee + o.pickup_fee;   -- pickup and/or delivery legs

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

  charge := subtotal + trips + ex_fee + pr_fee + o.reschedule_penalty;
  disc := least(disc, charge);
  bulk := least(bulk, charge - disc);        -- never drive the total below zero

  -- What the vendor receives.
  if o.commission_markup is null then
    -- placed before 0041: commission comes off the vendor's gross (as the payout does)
    earn := v_items + extras + trips;
    if o.discount_vendor_funded then earn := greatest(earn - disc, 0); end if;
    rate := current_commission_rate();
    earn := earn - round(earn * coalesce(rate, 0), 2);
  else
    earn := v_sub + trips;
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
revoke execute on function recompute_order(uuid) from public, anon;

-- Payout: legacy (pre-0041) orders now also carry the pickup fee into the
-- vendor's gross. Post-0041 orders use vendor_earnings, which recompute_order
-- already includes it in.
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
    vendor_gross := o.items_total + o.extras_total + o.delivery_fee + o.pickup_fee;
    if o.discount_vendor_funded then
      vendor_gross := greatest(vendor_gross - o.discount, 0);
    end if;
    rate := current_commission_rate();
    fee := round(vendor_gross * coalesce(rate, 0), 2);
  else
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
