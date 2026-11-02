-- ============================================================================
-- 0003  Functions and triggers
-- Enforce the business rules in the database so every client (web app, edge
-- function, future native app) gets the same behaviour for free.
-- ============================================================================

-- ─── Auth helpers (used by RLS in 0004) ─────────────────────────────────────
create or replace function current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('platform_admin','support_agent')
                   from profiles where id = auth.uid()), false);
$$;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'platform_admin'
                   from profiles where id = auth.uid()), false);
$$;

-- Vendors the current user is a staff member of.
create or replace function my_vendor_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select vendor_id from vendor_memberships where profile_id = auth.uid();
$$;

create or replace function is_vendor_staff(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_memberships
                 where profile_id = auth.uid() and vendor_id = v);
$$;

create or replace function is_vendor_manager(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_memberships
                 where profile_id = auth.uid() and vendor_id = v
                   and role = 'vendor_manager');
$$;

-- ─── New auth user → profile row ────────────────────────────────────────────
-- Fires when Supabase Auth creates a user. Pulls name/phone from sign-up
-- metadata. Role defaults to customer; staff are elevated by an admin.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, phone, role, email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Keep profiles.email_verified in step with auth confirmation.
create or replace function sync_email_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null then
    update profiles set email_verified = true where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function sync_email_verified();

-- ─── Order code generation: ORD-YYMMDD-NNNN ─────────────────────────────────
-- NNNN is a daily sequence. A per-day advisory counter table keeps it gapless.
create table if not exists order_daily_counter (
  day date primary key,
  last_seq int not null default 0
);

create or replace function assign_order_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Africa/Lagos')::date;
  seq int;
begin
  if new.code is not null and new.code <> '' then
    return new;
  end if;
  insert into order_daily_counter (day, last_seq) values (d, 1)
    on conflict (day) do update set last_seq = order_daily_counter.last_seq + 1
    returning last_seq into seq;

  new.code := 'ORD-' || to_char(d, 'YYMMDD') || '-' || lpad(seq::text, 4, '0');

  -- prepaid orders get a 4-digit handover code up front
  if new.payment_timing = 'online' and new.handover_code is null then
    new.handover_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger orders_assign_code
  before insert on orders
  for each row execute function assign_order_code();

-- ─── Item sub-code + price snapshot at check-in ─────────────────────────────
create or replace function assign_item_subcode() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ocode text;
  n int;
  listed numeric(12,2);
begin
  select code into ocode from orders where id = new.order_id;

  if new.sub_code is null or new.sub_code = '' then
    select count(*) + 1 into n from order_items where order_id = new.order_id;
    new.sub_code := ocode || '-' || lpad(n::text, 2, '0');
  end if;

  -- snapshot the current catalogue price if the caller did not set one
  if new.price_at_checkin is null then
    select price into listed from price_list
      where vendor_id = (select vendor_id from orders where id = new.order_id)
        and item_type_id = new.item_type_id
        and service = new.service
        and active
      limit 1;
    new.price_at_checkin := coalesce(listed, 0);
  end if;
  return new;
end;
$$;

create trigger order_items_assign_subcode
  before insert on order_items
  for each row execute function assign_item_subcode();

-- ─── Recompute order totals when items change ───────────────────────────────
create or replace function recompute_order_totals() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  oid uuid := coalesce(new.order_id, old.order_id);
  o orders%rowtype;
  items numeric(12,2);
  extras numeric(12,2);
  subtotal numeric(12,2);
  ex_pct numeric(5,4) := 0;
  pr_pct numeric(5,4) := 0;
  ex_fee numeric(12,2) := 0;
  pr_fee numeric(12,2) := 0;
begin
  select * into o from orders where id = oid;

  select coalesce(sum(price_at_checkin), 0) into items from order_items where order_id = oid;
  select coalesce(sum(price), 0)           into extras from order_extras where order_id = oid;
  subtotal := items + extras;

  -- platform markups (kept by the platform, not paid to the vendor)
  select express_pct, premium_pct into ex_pct, pr_pct from platform_settings where id = true;
  if o.turnaround = 'express'   then ex_fee := round(subtotal * coalesce(ex_pct, 0), 2); end if;
  if o.service_tier = 'premium' then pr_fee := round(subtotal * coalesce(pr_pct, 0), 2); end if;

  update orders
    set items_total  = items,
        extras_total = extras,
        express_fee  = ex_fee,
        premium_fee  = pr_fee,
        total        = subtotal + delivery_fee + ex_fee + pr_fee + reschedule_penalty
  where id = oid;
  return null;
end;
$$;

create trigger order_items_recompute
  after insert or update or delete on order_items
  for each row execute function recompute_order_totals();

-- extras changing also recomputes the order total (same function)
create trigger order_extras_recompute
  after insert or update or delete on order_extras
  for each row execute function recompute_order_totals();

-- ─── Tag lifecycle ──────────────────────────────────────────────────────────
-- Binding a tag code to an item marks the tag in_use; closing the order frees it.
create or replace function bind_tag_on_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tag_code is not null and new.tag_code <> coalesce(old.tag_code, '') then
    update tags set status = 'in_use', current_item_id = new.id
      where code = new.tag_code and status <> 'retired';
  end if;
  return new;
end;
$$;

create trigger order_items_bind_tag
  after insert or update of tag_code on order_items
  for each row execute function bind_tag_on_item();

-- ─── Stage event → order status, and payout creation on close ───────────────
create or replace function apply_stage_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'check_in' then
    update orders set status = 'checked_in', checked_in_at = coalesce(checked_in_at, now())
      where id = new.order_id and status in ('awaiting_dropoff','pickup_requested');
  elsif new.stage in ('sorting','washing','drying','pressing','quality_check','packaging') then
    update orders set status = 'processing'
      where id = new.order_id and status = 'checked_in';
  elsif new.stage = 'final_completion' then
    update orders set status = 'ready', ready_at = now(), completed_at = coalesce(completed_at, now())
      where id = new.order_id;
  elsif new.stage = 'out_for_delivery' then
    update orders set status = 'out_for_delivery' where id = new.order_id;
  elsif new.stage = 'handover' then
    update orders set status = 'closed', closed_at = now() where id = new.order_id;
  end if;
  return new;
end;
$$;

create trigger stage_events_apply
  after insert on stage_events
  for each row execute function apply_stage_event();

-- When an order closes AND payment has succeeded, schedule the vendor payout
-- for completed_at + 24h, net of commission / plan fee on the whole order total.
create or replace function schedule_payout_if_ready(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  paid boolean;
  pl vendor_plans%rowtype;
  fee numeric(12,2) := 0;
begin
  select * into o from orders where id = p_order;
  if o.status <> 'closed' then return; end if;

  select exists(select 1 from payments where order_id = p_order and status = 'succeeded') into paid;
  if not paid then return; end if;

  -- already scheduled?
  if exists (select 1 from payouts where p_order = any(order_ids)) then return; end if;

  -- The vendor is entitled to their work (items + extras) plus the delivery fee.
  -- Platform markups (express_fee, premium_fee) and any reschedule penalty are
  -- platform revenue and are excluded from the payout. Commission is the vendor's
  -- discounted rate, taken from that entitled amount.
  declare
    vendor_gross numeric(12,2) := o.items_total + o.extras_total + o.delivery_fee;
  begin
    select vp.* into pl from vendors v join vendor_plans vp on vp.id = v.plan_id where v.id = o.vendor_id;
    if pl.type in ('commission','combined') then
      fee := round(vendor_gross * coalesce(pl.commission_rate, 0), 2);
    end if;

    insert into payouts (vendor_id, order_ids, gross, fee, net, due_at, status)
    values (
      o.vendor_id, array[p_order], vendor_gross, fee, vendor_gross - fee,
      coalesce(o.completed_at, now()) + interval '24 hours',
      'due'
    );
  end;
end;
$$;

-- react to an order closing (typed to order_status)
create or replace function on_order_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' then
    -- Return this order's tags to the pool so they can be reused on another
    -- order. A lost/damaged tag that was retired stays retired.
    update tags t
      set status = 'free', current_item_id = null
      from order_items oi
      where oi.order_id = new.id
        and t.current_item_id = oi.id
        and t.status <> 'retired';

    perform schedule_payout_if_ready(new.id);
  end if;
  return new;
end;
$$;

create trigger orders_payout_check
  after update of status on orders
  for each row execute function on_order_closed();

-- react to a payment succeeding (typed to payment_status).
-- Paying on delivery closes the order; both paths then schedule the payout.
create or replace function on_payment_succeeded() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'succeeded' then
    update orders set status = 'closed', closed_at = coalesce(closed_at, now())
      where id = new.order_id and payment_timing = 'on_delivery' and status <> 'closed';
    perform schedule_payout_if_ready(new.order_id);
  end if;
  return new;
end;
$$;

create trigger payments_payout_check
  after insert or update of status on payments
  for each row execute function on_payment_succeeded();

-- ─── Delivery reschedule / non-collection ───────────────────────────────────
-- Records a failed delivery and resets the order to 'ready' for another attempt.
-- If the customer was at fault (not available), a penalty of
-- noncollection_penalty_pct × delivery_fee is added to the order total. If the
-- reason is a missing item or our error, no penalty and the delivery fee is
-- unchanged. Returns the penalty applied.
create or replace function apply_delivery_reschedule(p_order uuid, p_customer_fault boolean)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  pct numeric(5,4) := 0;
  penalty numeric(12,2) := 0;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'order not found'; end if;
  if not (is_vendor_staff(o.vendor_id) or is_admin()) then raise exception 'not authorized'; end if;

  if p_customer_fault then
    select noncollection_penalty_pct into pct from platform_settings where id = true;
    penalty := round(o.delivery_fee * coalesce(pct, 0), 2);
  end if;

  update orders
    set delivery_attempts  = delivery_attempts + 1,
        reschedule_penalty = reschedule_penalty + penalty,
        status             = 'ready',
        total = items_total + extras_total + delivery_fee + express_fee + premium_fee
                + (reschedule_penalty + penalty)
  where id = p_order;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'delivery_reschedule', 'order', p_order::text,
          json_build_object('customer_fault', p_customer_fault, 'penalty', penalty));

  return penalty;
end;
$$;
