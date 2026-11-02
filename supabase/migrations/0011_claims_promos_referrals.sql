-- ============================================================================
-- 0011  Claims & lost items, check-in evidence, dispatch logging,
--       promo codes, and referrals.
-- ============================================================================

-- ─── Check-in evidence ──────────────────────────────────────────────────────
alter table order_items add column condition_notes text;   -- attendant's note (stains/damage)
-- order_items.photos (jsonb) already exists for check-in photos.

-- ─── Dispatch logging + promo discount on orders ────────────────────────────
alter table orders add column dispatch_reference text;      -- booking ref when a dispatch partner is used
alter table orders add column promo_code text;
alter table orders add column discount_type text check (discount_type in ('percent', 'fixed'));
alter table orders add column discount_value numeric(12,2);
alter table orders add column discount_max numeric(12,2);
alter table orders add column discount numeric(12,2) not null default 0;

alter table platform_settings add column referral_reward numeric(12,2) not null default 0;

-- ─── Claims & lost-item workflow ────────────────────────────────────────────
create type claim_type as enum ('damage', 'loss');
create type claim_status as enum ('open', 'investigating', 'approved', 'rejected', 'resolved');

create table claims (
  id              uuid primary key default gen_random_uuid(),
  number          bigint generated always as identity,
  order_id        uuid not null references orders (id) on delete cascade,
  order_item_id   uuid references order_items (id),             -- the item in question (evidence source)
  customer_id     uuid not null references profiles (id),
  vendor_id       uuid not null references vendors (id),
  type            claim_type not null,
  description     text not null,
  status          claim_status not null default 'open',
  resolution_note text,
  compensation    numeric(12,2) not null default 0,
  resolved_by     uuid references profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index claims_vendor_idx on claims (vendor_id, created_at desc);
create index claims_customer_idx on claims (customer_id, created_at desc);
create trigger claims_updated before update on claims for each row execute function set_updated_at();

-- ─── Promo codes & redemptions ──────────────────────────────────────────────
create table promo_codes (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  discount_type      text not null check (discount_type in ('percent', 'fixed')),
  value              numeric(12,2) not null,
  max_discount       numeric(12,2),                            -- cap for percent codes
  min_order          numeric(12,2) not null default 0,
  usage_limit        int,                                      -- null = unlimited
  used_count         int not null default 0,
  per_customer_limit int not null default 1,
  owner_id           uuid references profiles (id),            -- when set, only this customer may use it (referral rewards)
  active             boolean not null default true,
  starts_at          timestamptz,
  expires_at         timestamptz,
  created_at         timestamptz not null default now()
);

create table promo_redemptions (
  id          uuid primary key default gen_random_uuid(),
  promo_id    uuid not null references promo_codes (id) on delete cascade,
  customer_id uuid not null references profiles (id),
  order_id    uuid references orders (id),
  amount      numeric(12,2) not null default 0,
  created_at  timestamptz not null default now()
);

-- ─── Referrals ──────────────────────────────────────────────────────────────
alter table profiles add column referral_code text unique;
alter table profiles add column referred_by uuid references profiles (id);
create type referral_status as enum ('pending', 'qualified', 'rewarded');

create table referrals (
  id              uuid primary key default gen_random_uuid(),
  referrer_id     uuid not null references profiles (id),
  referee_id      uuid not null unique references profiles (id),
  status          referral_status not null default 'pending',
  reward_promo_id uuid references promo_codes (id),
  created_at      timestamptz not null default now(),
  qualified_at    timestamptz
);

-- Backfill referral codes for any existing profiles.
update profiles set referral_code = 'LR' || upper(substr(md5(id::text), 1, 6)) where referral_code is null;

-- ─── New-user handler: referral code + captured referrer ────────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  referrer uuid;
begin
  if (new.raw_user_meta_data ? 'ref') and length(coalesce(new.raw_user_meta_data->>'ref', '')) > 0 then
    select id into referrer from profiles where referral_code = upper(new.raw_user_meta_data->>'ref');
  end if;

  insert into profiles (id, full_name, email, phone, role, email_verified, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
    new.email_confirmed_at is not null,
    'LR' || upper(substr(md5(new.id::text), 1, 6)),
    referrer
  )
  on conflict (id) do nothing;

  if referrer is not null then
    insert into referrals (referrer_id, referee_id, status)
      values (referrer, new.id, 'pending')
      on conflict (referee_id) do nothing;
  end if;
  return new;
end;
$$;

-- ─── Order totals recompute (now includes promo discount) ───────────────────
-- Extracted into a plain function so triggers, promo redemption and reschedule
-- all recompute consistently.
create or replace function recompute_order(oid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  items numeric(12,2); extras numeric(12,2); subtotal numeric(12,2);
  ex_pct numeric(5,4) := 0; pr_pct numeric(5,4) := 0;
  ex_fee numeric(12,2) := 0; pr_fee numeric(12,2) := 0;
  disc numeric(12,2) := 0; charge numeric(12,2);
begin
  select * into o from orders where id = oid;
  if o.id is null then return; end if;

  select coalesce(sum(price_at_checkin), 0) into items from order_items where order_id = oid;
  select coalesce(sum(price), 0)           into extras from order_extras where order_id = oid;
  subtotal := items + extras;

  select express_pct, premium_pct into ex_pct, pr_pct from platform_settings where id = true;
  if o.turnaround = 'express'   then ex_fee := round(subtotal * coalesce(ex_pct, 0), 2); end if;
  if o.service_tier = 'premium' then pr_fee := round(subtotal * coalesce(pr_pct, 0), 2); end if;

  if o.discount_type = 'percent' then
    disc := round(subtotal * coalesce(o.discount_value, 0) / 100, 2);
    if o.discount_max is not null then disc := least(disc, o.discount_max); end if;
  elsif o.discount_type = 'fixed' then
    disc := coalesce(o.discount_value, 0);
  end if;

  charge := subtotal + o.delivery_fee + ex_fee + pr_fee + o.reschedule_penalty;
  disc := least(disc, charge);

  update orders
    set items_total = items, extras_total = extras,
        express_fee = ex_fee, premium_fee = pr_fee,
        discount = disc,
        total = charge - disc
  where id = oid;
end;
$$;

create or replace function recompute_order_totals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recompute_order(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

-- reschedule now recomputes through the shared function (keeps discount correct)
create or replace function apply_delivery_reschedule(p_order uuid, p_customer_fault boolean)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; pct numeric(5,4) := 0; penalty numeric(12,2) := 0;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'order not found'; end if;
  if not (is_vendor_staff(o.vendor_id) or is_admin()) then raise exception 'not authorized'; end if;

  if p_customer_fault then
    select noncollection_penalty_pct into pct from platform_settings where id = true;
    penalty := round(o.delivery_fee * coalesce(pct, 0), 2);
  end if;

  update orders
    set delivery_attempts = delivery_attempts + 1,
        reschedule_penalty = reschedule_penalty + penalty,
        status = 'ready'
  where id = p_order;
  perform recompute_order(p_order);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'delivery_reschedule', 'order', p_order::text,
          json_build_object('customer_fault', p_customer_fault, 'penalty', penalty));
  return penalty;
end;
$$;

-- ─── Redeem a promo code onto an order ──────────────────────────────────────
create or replace function redeem_promo(p_code text, p_order uuid) returns json
language plpgsql security definer set search_path = public as $$
declare pc promo_codes%rowtype; uid uuid := auth.uid(); n int;
begin
  select * into pc from promo_codes where upper(code) = upper(p_code) and active;
  if not found then raise exception 'Invalid code'; end if;
  if pc.starts_at is not null and now() < pc.starts_at then raise exception 'Code is not active yet'; end if;
  if pc.expires_at is not null and now() > pc.expires_at then raise exception 'Code has expired'; end if;
  if pc.usage_limit is not null and pc.used_count >= pc.usage_limit then raise exception 'Code is fully used'; end if;
  if pc.owner_id is not null and pc.owner_id <> uid then raise exception 'Code is not valid for this account'; end if;
  if not exists (select 1 from orders where id = p_order and customer_id = uid) then raise exception 'order not found'; end if;
  if exists (select 1 from orders where id = p_order and promo_code is not null) then raise exception 'A code is already applied'; end if;

  select count(*) into n from promo_redemptions where promo_id = pc.id and customer_id = uid;
  if n >= pc.per_customer_limit then raise exception 'You have already used this code'; end if;

  update promo_codes set used_count = used_count + 1 where id = pc.id;
  insert into promo_redemptions (promo_id, customer_id, order_id) values (pc.id, uid, p_order);
  update orders set promo_code = pc.code, discount_type = pc.discount_type,
                    discount_value = pc.value, discount_max = pc.max_discount
    where id = p_order;
  perform recompute_order(p_order);

  return json_build_object('code', pc.code, 'discount_type', pc.discount_type, 'value', pc.value);
end;
$$;

-- ─── Referral reward on the referee's first completed+paid order ─────────────
create or replace function reward_referral_if_eligible(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; r referrals%rowtype; rew numeric(12,2); pid uuid;
begin
  select * into o from orders where id = p_order;
  if o.status <> 'closed' then return; end if;
  if not exists (select 1 from payments where order_id = p_order and status = 'succeeded') then return; end if;

  select * into r from referrals where referee_id = o.customer_id and status = 'pending';
  if not found then return; end if;

  select referral_reward into rew from platform_settings where id = true;
  if coalesce(rew, 0) <= 0 then
    update referrals set status = 'qualified', qualified_at = now() where id = r.id;
    return;
  end if;

  insert into promo_codes (code, discount_type, value, usage_limit, per_customer_limit, owner_id, active, expires_at)
    values ('REF' || upper(substr(md5(random()::text), 1, 6)), 'fixed', rew, 1, 1, r.referrer_id, true, now() + interval '90 days')
    returning id into pid;
  update referrals set status = 'qualified', qualified_at = now(), reward_promo_id = pid where id = r.id;
end;
$$;

create or replace function trg_referral_reward() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' then perform reward_referral_if_eligible(new.id); end if;
  return new;
end;
$$;
create trigger orders_referral_reward
  after update of status on orders
  for each row execute function trg_referral_reward();

-- ─── Analytics (admin-only) ─────────────────────────────────────────────────
create or replace function get_analytics() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return (select json_build_object(
    'revenue', (select coalesce(sum(amount), 0) from payments where status = 'succeeded'),
    'orders_closed', (select count(*) from orders where status = 'closed'),
    'avg_turnaround_hours', (
      select round(avg(extract(epoch from (closed_at - checked_in_at)) / 3600)::numeric, 1)
      from orders where status = 'closed' and checked_in_at is not null and closed_at is not null),
    'repeat_rate', (
      with per as (select customer_id, count(*) c from orders group by customer_id)
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where c > 1) / count(*), 1) end from per),
    'top_items', (
      select coalesce(json_agg(t), '[]') from (
        select it.name, count(*) as qty
        from order_items oi join item_types it on it.id = oi.item_type_id
        group by it.name order by qty desc limit 6
      ) t)
  ));
end;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table claims            enable row level security;
alter table promo_codes       enable row level security;
alter table promo_redemptions enable row level security;
alter table referrals         enable row level security;

-- claims: customer sees/opens own; vendor staff see their vendor's; admin manages all
create policy claims_read on claims for select
  using (customer_id = auth.uid() or is_vendor_staff(vendor_id) or is_admin());
create policy claims_customer_insert on claims for insert
  with check (
    customer_id = auth.uid() and
    exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid() and o.vendor_id = claims.vendor_id)
  );
create policy claims_admin_update on claims for update using (is_admin()) with check (is_admin());

-- promo codes: admin only (customers never list them; they apply via redeem_promo)
create policy promos_admin on promo_codes for all using (is_platform_admin()) with check (is_platform_admin());

-- redemptions: a customer sees their own; admin all (writes happen via redeem_promo)
create policy promo_red_read on promo_redemptions for select
  using (customer_id = auth.uid() or is_admin());

-- referrals: referrer and referee see their rows; admin all
create policy referrals_read on referrals for select
  using (referrer_id = auth.uid() or referee_id = auth.uid() or is_admin());
