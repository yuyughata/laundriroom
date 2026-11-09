-- ═══════════════════════════════════════════════════════════════════════════
-- 0048  Who keeps the delivery fee: vendor vs dispatch
--   The customer always pays the delivery fee. Who keeps it depends on who
--   delivers (orders.delivered_by):
--     • own_rider (or unset)  → the vendor keeps it (its own rider delivered).
--     • dispatch_partner      → the platform keeps it and settles the dispatch
--                               company out of band.
--   Pickup is always the vendor's own rider, so the pickup fee always goes to
--   the vendor.
--
--   delivered_by follows the vendor's rider choice: assign_order_rider now sets
--   it from the assigned rider's kind (dispatch → dispatch_partner, own →
--   own_rider) on a delivery order and re-prices it. recompute_order and the
--   legacy payout branch route the delivery fee by delivered_by; the customer
--   total is unchanged.
-- Drop-free; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- Totals: the customer pays items + extras + pickup + delivery + markups; the
-- vendor keeps items + extras + pickup, plus delivery only when its own rider
-- delivers (dispatch deliveries: the platform keeps the fee to pay dispatch).
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

  select coalesce(sum(coalesce(customer_price, price_at_checkin)), 0),
         coalesce(sum(price_at_checkin), 0), count(*)
    into items, v_items, item_count
    from order_items where order_id = oid;
  select coalesce(sum(price), 0) into extras from order_extras where order_id = oid;
  subtotal := items + extras;      -- what the customer pays for the work
  v_sub    := v_items + extras;    -- the vendor's own price for it

  -- Trip fees. The customer pays both legs; the vendor keeps the pickup and
  -- keeps the delivery only when its own rider delivers.
  vendor_delivery := case when o.delivered_by = 'dispatch_partner' then 0 else o.delivery_fee end;
  trips       := o.delivery_fee + o.pickup_fee;   -- customer side
  vendor_trip := vendor_delivery + o.pickup_fee;  -- vendor side

  select express_pct, premium_pct, bulk_min_items, bulk_discount_pct
    into ex_pct, pr_pct, b_min, b_pct
    from platform_settings where id = true;

  if o.turnaround = 'express'   then ex_fee := round(v_sub * coalesce(ex_pct, 0), 2); end if;
  if o.service_tier = 'premium' then pr_fee := round(v_sub * coalesce(pr_pct, 0), 2); end if;

  if o.discount_type = 'percent' then
    disc := round(subtotal * coalesce(o.discount_value, 0) / 100, 2);
    if o.discount_max is not null then disc := least(disc, o.discount_max); end if;
  elsif o.discount_type = 'fixed' then
    disc := coalesce(o.discount_value, 0);
  end if;

  if b_min > 0 and item_count >= b_min then
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

-- Legacy (pre-0041) payout: same routing — the vendor's gross keeps the
-- pickup fee always and the delivery fee only for its own-rider deliveries.
create or replace function schedule_payout_if_ready(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; paid boolean; rate numeric(5,4); fee numeric(12,2) := 0;
  vendor_gross numeric(12,2); delay int := 0; v_delivery numeric(12,2);
begin
  select * into o from orders where id = p_order;
  if o.status <> 'closed' then return; end if;
  select exists(select 1 from payments where order_id = p_order and status = 'succeeded') into paid;
  if not paid then return; end if;
  if exists (select 1 from payouts where p_order = any(order_ids)) then return; end if;

  if o.commission_markup is null then
    v_delivery := case when o.delivered_by = 'dispatch_partner' then 0 else o.delivery_fee end;
    vendor_gross := o.items_total + o.extras_total + o.pickup_fee + v_delivery;
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

-- Assigning a rider sets who delivers (and re-prices the order), so a dispatch
-- rider routes the delivery fee to the platform and an own rider to the vendor.
create or replace function assign_order_rider(
  p_order uuid, p_contact uuid default null,
  p_name text default null, p_phone text default null,
  p_kind text default 'own', p_company text default null, p_save boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; c rider_contacts%rowtype; my_branch uuid;
  nm text := btrim(coalesce(p_name, '')); ph text := btrim(coalesce(p_phone, ''));
  eff_kind text := null;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'order not found'; end if;
  if not (can_staff_branch(o.vendor_id, o.branch_id) or is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_contact is not null then
    select * into c from rider_contacts where id = p_contact and vendor_id = o.vendor_id;
    if c.id is null or not c.active then raise exception 'That rider isn''t on your list any more.'; end if;
    if c.branch_id is not null and c.branch_id is distinct from o.branch_id and not is_admin()
       and not exists (select 1 from vendor_memberships where profile_id = auth.uid() and vendor_id = o.vendor_id and branch_id is null) then
      raise exception 'That rider works for another branch.';
    end if;
    eff_kind := c.kind;
  elsif nm = '' and ph = '' then
    update orders set rider_name = null, rider_phone = null, rider_contact_id = null where id = p_order;
    return null;
  else
    if nm = '' then raise exception 'Enter the rider''s name.'; end if;
    if length(phone_key(ph)) < 7 then raise exception 'Enter the rider''s phone number.'; end if;
    if p_kind not in ('own', 'dispatch') then raise exception 'bad rider type'; end if;
    eff_kind := p_kind;
    if p_save then
      select * into c from rider_contacts where vendor_id = o.vendor_id and phone_key = phone_key(ph);
      if c.id is null then
        select m.branch_id into my_branch from vendor_memberships m
         where m.profile_id = auth.uid() and m.vendor_id = o.vendor_id;
        insert into rider_contacts (vendor_id, branch_id, name, phone, kind, company, created_by)
        values (o.vendor_id, my_branch, nm, ph, p_kind, nullif(btrim(coalesce(p_company, '')), ''), auth.uid())
        returning * into c;
      elsif not c.active then
        update rider_contacts set active = true where id = c.id returning * into c;
      end if;
    end if;
  end if;

  update orders
     set rider_contact_id = c.id,
         rider_name  = coalesce(c.name, nm),
         rider_phone = coalesce(c.phone, ph),
         -- who delivers: a dispatch rider on a delivery order routes the
         -- delivery fee to the platform; own rider keeps it with the vendor.
         delivered_by = case
           when o.return_mode = 'delivery' and eff_kind = 'dispatch' then 'dispatch_partner'::delivered_by
           when o.return_mode = 'delivery' and eff_kind = 'own'      then 'own_rider'::delivered_by
           else o.delivered_by end
   where id = p_order;
  if c.id is not null then update rider_contacts set last_used_at = now() where id = c.id; end if;
  if o.return_mode = 'delivery' and eff_kind is not null then perform recompute_order(p_order); end if;
  return c.id;
end;
$$;
revoke execute on function assign_order_rider(uuid, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function assign_order_rider(uuid, uuid, text, text, text, text, boolean) to authenticated;
