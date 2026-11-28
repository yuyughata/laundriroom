-- ═══════════════════════════════════════════════════════════════════════════
-- 0065 — Lucky win on tiered promo codes
--
-- A tiered promo can reward a "lucky" order: the vendor (or admin) sets a
-- number N, and every Nth use of the code (N, 2N, 3N, …) gets the code's TOP
-- tier discount regardless of the order value — even below the lowest tier
-- minimum. Tiered codes only. Funding is unchanged: a vendor-funded code's
-- discount still comes out of the vendor's payout, a platform code's doesn't.
--
--   promo_codes.lucky_use int   N = every Nth use wins; NULL/0 = off
--   orders.lucky_win       bool set at redemption when this use is the Nth
-- ═══════════════════════════════════════════════════════════════════════════

alter table promo_codes add column if not exists lucky_use int;
alter table orders      add column if not exists lucky_win boolean not null default false;

comment on column promo_codes.lucky_use is 'Lucky win: every Nth use of a tiered code gets the top tier regardless of order value (0065). NULL/0 = off.';
comment on column orders.lucky_win is 'This order won the promo''s lucky Nth use (0065): recompute applies the top tier regardless of value.';

-- ── recompute_order: a lucky-win order gets the top tier regardless of value ─
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
  disc numeric(12,2) := 0; charge numeric(12,2); tier_pct numeric(8,3);
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

  if o.discount_tiers is not null and jsonb_array_length(o.discount_tiers) > 0 then
    if o.lucky_win then
      -- Lucky Nth use: the top tier, no minimum.
      select max((t->>'pct')::numeric) into tier_pct
        from jsonb_array_elements(o.discount_tiers) t;
    else
      -- highest tier whose minimum the subtotal reaches; none => no discount
      select (t->>'pct')::numeric into tier_pct
        from jsonb_array_elements(o.discount_tiers) t
        where (t->>'min')::numeric <= subtotal
        order by (t->>'min')::numeric desc limit 1;
    end if;
    if tier_pct is not null then
      disc := round(subtotal * tier_pct / 100, 2);
      if o.discount_max is not null then disc := least(disc, o.discount_max); end if;
    else
      disc := 0;
    end if;
  elsif o.discount_type = 'percent' then
    disc := round(subtotal * coalesce(o.discount_value, 0) / 100, 2);
    if o.discount_max is not null then disc := least(disc, o.discount_max); end if;
    if subtotal < coalesce(o.discount_min_order, 0) then disc := 0; end if;
  elsif o.discount_type = 'fixed' then
    disc := coalesce(o.discount_value, 0);
    if subtotal < coalesce(o.discount_min_order, 0) then disc := 0; end if;
  end if;

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

-- ── redeem_promo: mark the Nth tiered use as a lucky win ─────────────────────
create or replace function public.redeem_promo(p_code text, p_order uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare pc promo_codes%rowtype; uid uuid := auth.uid(); n int; ov uuid; base numeric(12,2);
        is_tiered boolean; new_count int; lucky boolean := false;
begin
  select * into pc from promo_codes where upper(code) = upper(p_code) and active;
  if not found then raise exception 'Invalid code'; end if;
  if pc.starts_at is not null and now() < pc.starts_at then raise exception 'Code is not active yet'; end if;
  if pc.expires_at is not null and now() > pc.expires_at then raise exception 'Code has expired'; end if;
  if pc.usage_limit is not null and pc.used_count >= pc.usage_limit then raise exception 'Code is fully used'; end if;
  if pc.owner_id is not null and pc.owner_id <> uid then raise exception 'Code is not valid for this account'; end if;

  select vendor_id, coalesce(items_total, 0) + coalesce(extras_total, 0)
    into ov, base
    from orders where id = p_order and customer_id = uid;
  if ov is null then raise exception 'order not found'; end if;
  if pc.vendor_id is not null and pc.vendor_id <> ov then raise exception 'This code is not valid for this laundry'; end if;
  if exists (select 1 from orders where id = p_order and promo_code is not null) then raise exception 'A code is already applied'; end if;

  is_tiered := pc.tiers is not null and jsonb_array_length(pc.tiers) > 0;

  -- Flat codes keep the single-minimum check; tiered codes gate per tier later.
  if not is_tiered and coalesce(pc.min_order, 0) > 0 and base > 0 and base < pc.min_order then
    raise exception 'Oops! Spend ₦% or more to enjoy your discount. Keep your code handy for next time!', trim(to_char(pc.min_order, 'FM999G999G990'));
  end if;

  select count(*) into n from promo_redemptions where promo_id = pc.id and customer_id = uid;
  if n >= pc.per_customer_limit then raise exception 'You have already used this code'; end if;

  -- Row lock here serialises concurrent redemptions, so each gets a distinct
  -- used_count and at most one redemption is the Nth.
  update promo_codes set used_count = used_count + 1 where id = pc.id
    returning used_count into new_count;
  insert into promo_redemptions (promo_id, customer_id, order_id) values (pc.id, uid, p_order);

  lucky := is_tiered and coalesce(pc.lucky_use, 0) > 0 and (new_count % pc.lucky_use) = 0;

  if is_tiered then
    update orders
      set promo_code = pc.code, discount_type = 'percent',
          discount_value = 0, discount_max = pc.max_discount,
          discount_min_order = coalesce((select min((t->>'min')::numeric) from jsonb_array_elements(pc.tiers) t), 0),
          discount_tiers = pc.tiers,
          discount_vendor_funded = (pc.vendor_id is not null),
          lucky_win = lucky
      where id = p_order;
  else
    update orders
      set promo_code = pc.code, discount_type = pc.discount_type,
          discount_value = pc.value, discount_max = pc.max_discount,
          discount_min_order = coalesce(pc.min_order, 0),
          discount_tiers = null,
          discount_vendor_funded = (pc.vendor_id is not null),
          lucky_win = false
      where id = p_order;
  end if;
  perform recompute_order(p_order);

  return json_build_object('code', pc.code, 'discount_type', pc.discount_type, 'value', pc.value,
                           'tiered', is_tiered, 'lucky_win', lucky);
end;
$function$;
