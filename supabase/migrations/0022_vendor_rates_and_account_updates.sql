-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 — Per-vendor rates, vendor column guard, account email plumbing.
--
-- Rates: one platform-wide set (commission = the default plan's rate; express
-- and premium = platform_settings). An admin can override any of the three for
-- a vendor; NULL means "use the platform rate". Money flow is unchanged:
-- express/premium markups stay with the platform, commission comes off the
-- vendor's items + extras + delivery.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Override columns ───────────────────────────────────────────────────
alter table vendors
  add column if not exists commission_rate_override numeric(5,4)
    check (commission_rate_override is null or commission_rate_override between 0 and 1),
  add column if not exists express_pct_override numeric(5,4)
    check (express_pct_override is null or express_pct_override between 0 and 1),
  add column if not exists premium_pct_override numeric(5,4)
    check (premium_pct_override is null or premium_pct_override between 0 and 1);

comment on column vendors.commission_rate_override is 'Admin override of the commission rate for this vendor; NULL = platform rate (default plan).';
comment on column vendors.express_pct_override is 'Admin override of the express markup for this vendor; NULL = platform_settings.express_pct.';
comment on column vendors.premium_pct_override is 'Admin override of the premium markup for this vendor; NULL = platform_settings.premium_pct.';

-- ─── 2. Order pricing uses the vendor's express/premium override ──────────
create or replace function recompute_order(oid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  items numeric(12,2); extras numeric(12,2); subtotal numeric(12,2);
  ex_pct numeric(5,4) := 0; pr_pct numeric(5,4) := 0;
  ex_fee numeric(12,2) := 0; pr_fee numeric(12,2) := 0;
  disc numeric(12,2) := 0; charge numeric(12,2);
  item_count int := 0;
  b_min int := 0; b_pct numeric(5,4) := 0; bulk numeric(12,2) := 0;
begin
  select * into o from orders where id = oid;
  if o.id is null then return; end if;

  select coalesce(sum(price_at_checkin), 0), count(*) into items, item_count
    from order_items where order_id = oid;
  select coalesce(sum(price), 0) into extras from order_extras where order_id = oid;
  subtotal := items + extras;

  select coalesce(v.express_pct_override, s.express_pct),
         coalesce(v.premium_pct_override, s.premium_pct),
         s.bulk_min_items, s.bulk_discount_pct
    into ex_pct, pr_pct, b_min, b_pct
    from platform_settings s
    left join vendors v on v.id = o.vendor_id
   where s.id = true;

  if o.turnaround = 'express'   then ex_fee := round(subtotal * coalesce(ex_pct, 0), 2); end if;
  if o.service_tier = 'premium' then pr_fee := round(subtotal * coalesce(pr_pct, 0), 2); end if;

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

  update orders
    set items_total = items, extras_total = extras,
        express_fee = ex_fee, premium_fee = pr_fee,
        discount = disc, bulk_discount = bulk,
        total = charge - disc - bulk
  where id = oid;
end;
$$;

-- ─── 3. Payouts use the vendor's commission override ──────────────────────
create or replace function schedule_payout_if_ready(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; paid boolean; rate numeric(5,4); fee numeric(12,2) := 0;
  vendor_gross numeric(12,2);
begin
  select * into o from orders where id = p_order;
  if o.status <> 'closed' then return; end if;
  select exists(select 1 from payments where order_id = p_order and status = 'succeeded') into paid;
  if not paid then return; end if;
  if exists (select 1 from payouts where p_order = any(order_ids)) then return; end if;

  -- Vendor is entitled to items + extras + delivery, less any discount the VENDOR
  -- funded (platform-funded discounts do not touch the payout).
  vendor_gross := o.items_total + o.extras_total + o.delivery_fee;
  if o.discount_vendor_funded then
    vendor_gross := greatest(vendor_gross - o.discount, 0);
  end if;

  -- Commission: the vendor's override, else its plan's rate, else the default plan's.
  select coalesce(
           v.commission_rate_override,
           (select vp.commission_rate from vendor_plans vp where vp.id = v.plan_id and vp.type in ('commission', 'combined')),
           (select vp.commission_rate from vendor_plans vp where vp.is_default and vp.active limit 1),
           0)
    into rate
    from vendors v where v.id = o.vendor_id;
  fee := round(vendor_gross * coalesce(rate, 0), 2);

  insert into payouts (vendor_id, order_ids, gross, fee, net, due_at, status)
  values (
    o.vendor_id, array[p_order], vendor_gross, fee, vendor_gross - fee,
    coalesce(o.completed_at, now()) + interval '24 hours', 'due'
  );
end;
$$;

-- ─── 4. Vendor managers can't change admin-controlled vendor columns ──────
-- vendors_manager_update lets a manager update their own vendor row; without
-- this guard they could also verify themselves or set their own rates.
create or replace function guard_vendor_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not is_platform_admin() then
    if new.status                   is distinct from old.status
    or new.plan_id                  is distinct from old.plan_id
    or new.kyc_verified             is distinct from old.kyc_verified
    or new.commission_rate_override is distinct from old.commission_rate_override
    or new.express_pct_override     is distinct from old.express_pct_override
    or new.premium_pct_override     is distinct from old.premium_pct_override
    then
      raise exception 'only a platform admin can change these vendor settings' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vendors_guard_columns on vendors;
create trigger vendors_guard_columns before update on vendors
  for each row execute function guard_vendor_columns();

-- ─── 5. Keep profiles.email in step when a user changes their email ───────
create or replace function sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function sync_profile_email();

revoke execute on function guard_vendor_columns(), sync_profile_email() from public, anon, authenticated;

-- ─── 6. Rules for the account & security emails ───────────────────────────
insert into notification_rules (event, channels, fallback_order, recipients, enabled)
select e, '{email}'::notif_channel[], '{email}'::notif_channel[], '{user}'::text[], true
from unnest(array['password_changed', 'account_updated', 'account_suspended', 'account_reactivated']::notif_event[]) as e
where not exists (select 1 from notification_rules r where r.event = e);
