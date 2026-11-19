-- 0058_percentage_premium_extras.sql
--
-- Premium extras can now be priced as a PERCENTAGE as well as a fixed ₦ amount.
-- A percentage extra's amount is the set percentage of the order's items
-- subtotal (the customer garment prices), resolved after check-in once item
-- prices are known. The customer sees the rate up front; the money goes to the
-- vendor, exactly like a fixed extra.
--
--   service_extras.price_type  'fixed' | 'percent'
--   service_extras.percent     the rate when price_type = 'percent' (e.g. 10.00)
--   order_extras snapshots both, and order_extras.price holds the resolved
--   amount (0 until check-in for a percentage extra).

alter table service_extras
  add column if not exists price_type text not null default 'fixed'
    check (price_type in ('fixed', 'percent')),
  add column if not exists percent numeric(5,2) not null default 0
    check (percent >= 0 and percent <= 100);

alter table order_extras
  add column if not exists price_type text not null default 'fixed',
  add column if not exists percent numeric(5,2) not null default 0;

comment on column service_extras.price_type is 'fixed = flat ₦ price; percent = % of the order items subtotal after check-in.';
comment on column order_extras.percent is 'Snapshot of the extra''s rate; order_extras.price is resolved to percent% of items at check-in.';

-- Re-price including percentage extras. Only the else (non wash-&-dry) branch
-- gains a step that resolves percentage extras off the customer items subtotal;
-- the `price is distinct from` guard stops the order_extras UPDATE trigger from
-- recursing (the second pass computes the same value and makes no change).
create or replace function public.recompute_order(oid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    v_items := coalesce(o.wash_dry_price, 0);
    items   := round(v_items * (1 + coalesce(o.commission_markup, 0)));
    extras  := 0;
    select count(*) into item_count from order_items where order_id = oid;
  else
    select coalesce(sum(coalesce(customer_price, price_at_checkin)), 0),
           coalesce(sum(price_at_checkin), 0), count(*)
      into items, v_items, item_count
      from order_items where order_id = oid;
    -- Resolve percentage extras off the customer items subtotal (after check-in).
    update order_extras set price = round(items * percent / 100)
      where order_id = oid and price_type = 'percent'
        and price is distinct from round(items * percent / 100);
    select coalesce(sum(price), 0) into extras from order_extras where order_id = oid;
  end if;
  subtotal := items + extras;
  v_sub    := v_items + extras;
  vendor_delivery := case when o.delivered_by = 'dispatch_partner' then 0 else o.delivery_fee end;
  trips       := o.delivery_fee + o.pickup_fee;
  vendor_trip := vendor_delivery + o.pickup_fee;
  select express_pct, premium_pct, bulk_min_items, bulk_discount_pct
    into ex_pct, pr_pct, b_min, b_pct
    from platform_settings where id = true;
  if o.turnaround = 'express' then ex_fee := round(v_sub * coalesce(ex_pct, 0), 2); end if;
  if o.service_tier = 'premium' and not o.wash_dry then pr_fee := round(v_sub * coalesce(pr_pct, 0), 2); end if;
  if o.discount_type = 'percent' then
    disc := round(subtotal * coalesce(o.discount_value, 0) / 100, 2);
    if o.discount_max is not null then disc := least(disc, o.discount_max); end if;
  elsif o.discount_type = 'fixed' then
    disc := coalesce(o.discount_value, 0);
  end if;
  if subtotal < coalesce(o.discount_min_order, 0) then disc := 0; end if;
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
$function$;
