-- ═══════════════════════════════════════════════════════════════════════════
-- 0049  Wash & dry only (bulk)
--   The full service is wash, dry, press & fold. This adds an optional
--   flat-rate "wash & dry only" service, meant for bulk family-size loads.
--     • Admin → Services & extras sets one platform price and the number of
--       clothes that qualify (`platform_settings.wash_dry_price` — what the
--       laundry receives; `wash_dry_min_items`). Price 0 = the offering is off.
--     • A vendor opts in (`vendors.offers_wash_dry`); otherwise it offers only
--       the full service.
--     • A customer who picks it places a flat-priced order
--       (`orders.wash_dry`, with `orders.wash_dry_price` snapshotting the base
--       at order time). Commission is added on top for the customer, exactly
--       like item prices (0041); the vendor keeps the base. No per-item
--       pricing, no premium tier/extras; items are still tagged for tracking.
--       Delivery/pickup trips are added as usual.
--
--   recompute_order prices a wash-&-dry order from the flat base instead of the
--   per-item sum. A new after-insert reprice makes the order carry its price
--   (and its trip fees) straight away, before any item is checked in.
-- Drop-free; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table platform_settings add column if not exists wash_dry_price    numeric(12,2) not null default 0;  -- base (vendor receives); 0 = off
alter table platform_settings add column if not exists wash_dry_min_items int           not null default 0;  -- clothes that qualify

alter table vendors add column if not exists offers_wash_dry boolean not null default false;

alter table orders add column if not exists wash_dry       boolean       not null default false;
alter table orders add column if not exists wash_dry_price numeric(12,2) not null default 0;   -- vendor base, snapshot at creation

-- Price an order. A wash-&-dry order is a flat bundle (base + commission for
-- the customer, base for the vendor); everything else is the per-item sum.
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
  trips numeric(12,2); vendor_trip numeric(12,2); vendor_delivery numeric(12,2);
begin
  select * into o from orders where id = oid;
  if o.id is null then return; end if;

  if o.wash_dry then
    -- flat bundle: the vendor's base, commission added on top for the customer
    v_items := coalesce(o.wash_dry_price, 0);
    items   := round(v_items * (1 + coalesce(o.commission_markup, 0)));
    extras  := 0;
    select count(*) into item_count from order_items where order_id = oid;
  else
    select coalesce(sum(coalesce(customer_price, price_at_checkin)), 0),
           coalesce(sum(price_at_checkin), 0), count(*)
      into items, v_items, item_count
      from order_items where order_id = oid;
    select coalesce(sum(price), 0) into extras from order_extras where order_id = oid;
  end if;
  subtotal := items + extras;      -- what the customer pays for the work
  v_sub    := v_items + extras;    -- the vendor's own price for it

  vendor_delivery := case when o.delivered_by = 'dispatch_partner' then 0 else o.delivery_fee end;
  trips       := o.delivery_fee + o.pickup_fee;   -- customer side
  vendor_trip := vendor_delivery + o.pickup_fee;  -- vendor side

  select express_pct, premium_pct, bulk_min_items, bulk_discount_pct
    into ex_pct, pr_pct, b_min, b_pct
    from platform_settings where id = true;

  -- express applies to a wash-&-dry order too; premium does not (standard only)
  if o.turnaround = 'express' then ex_fee := round(v_sub * coalesce(ex_pct, 0), 2); end if;
  if o.service_tier = 'premium' and not o.wash_dry then pr_fee := round(v_sub * coalesce(pr_pct, 0), 2); end if;

  if o.discount_type = 'percent' then
    disc := round(subtotal * coalesce(o.discount_value, 0) / 100, 2);
    if o.discount_max is not null then disc := least(disc, o.discount_max); end if;
  elsif o.discount_type = 'fixed' then
    disc := coalesce(o.discount_value, 0);
  end if;

  -- the platform bulk discount is a per-item-count rule; it doesn't stack on
  -- the already-bulk wash-&-dry flat rate
  if not o.wash_dry and b_min > 0 and item_count >= b_min then
    bulk := round(items * coalesce(b_pct, 0), 2);
  end if;

  charge := subtotal + trips + ex_fee + pr_fee + o.reschedule_penalty;
  disc := least(disc, charge);
  bulk := least(bulk, charge - disc);

  if o.commission_markup is null then
    earn := v_items + extras + vendor_trip;
    if o.discount_vendor_funded then earn := greatest(earn - disc, 0); end if;
    rate := current_commission_rate();
    earn := earn - round(earn * coalesce(rate, 0), 2);
  else
    earn := v_sub + vendor_trip;
    if o.discount_vendor_funded and disc > 0 then
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

-- Give a new order its price (and trip fees) at once — important for a wash-&-
-- dry order, which is fully priced before any item is checked in, and it also
-- makes a pickup-only order show its pickup fee straight away.
create or replace function reprice_new_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recompute_order(new.id);
  return null;
end;
$$;
revoke execute on function reprice_new_order() from public, anon, authenticated;
create or replace trigger orders_reprice_on_insert after insert on orders
  for each row execute function reprice_new_order();
