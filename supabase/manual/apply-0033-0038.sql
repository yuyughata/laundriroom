-- ═══════════════════════════════════════════════════════════════════════════
-- laundriroom — database update 0033 → 0038:
--   0033 multi-branch vendors          0036 printable tag batches
--   0034 Partner Agreement clauses     0037 review-quality notification events
--   0035 distance delivery pricing     0038 bad-review flags + escalation
--
-- HOW TO RUN: Supabase → your laundriroom project → SQL Editor → New query →
-- paste this whole file → Run. Success shows "Success. No rows returned".
--
-- It runs in two transactions (Postgres must commit new event names before
-- they can be used): PART 1 = 0033–0037, PART 2 = 0038. If a step or a
-- self-check fails, that part changes nothing and you'll see the reason.
-- Safe to run again — already-applied parts are skipped or re-applied as-is.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ PART 1 of 2 ═══════════════════════════════════════════════════════════
begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0033 — Multi-branch vendors.
--
-- A vendor is the business (name, KYC, commission, one shared price list, one
-- payout bank account, one profile link). A business has one or more
-- BRANCHES — the shop locations, each with its own address, hours and
-- open/closed switch. Every order belongs to a branch.
--
-- 1. branches: one row per location. Every vendor gets a main branch,
--    created from the vendor's existing location when the vendor is created
--    (and backfilled here). The main branch's location/hours are mirrored
--    back onto the vendor row so older screens keep working.
-- 2. vendor_memberships.branch_id: NULL = business-wide (sees every branch);
--    set = that branch only. Existing attendants and riders are attached to
--    the main branch; existing managers stay business-wide.
-- 3. orders.branch_id: set on insert — the branch the customer chose, or
--    the staff member's own branch, or the main branch — and must be an
--    active branch of the order's vendor.
-- 4. Access: staff only see orders of branches they belong to
--    (can_staff_branch). Child tables (items, stages, photos, payments…)
--    look the order up through orders' RLS, so they follow automatically;
--    order_summaries and the two staff RPCs check it explicitly.
--    is_vendor_manager() now means a BUSINESS-WIDE manager: only they manage
--    branches, staff, the shared price list, promos and the payout account.
--    A branch manager (manager tied to a branch) runs that branch.
-- 5. get_vendor_profile also returns the active branches.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Branches ────────────────────────────────────────────────────────────
create table if not exists branches (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references vendors (id) on delete cascade,
  name              text not null,
  is_main           boolean not null default false,
  active            boolean not null default true,
  phone             text,
  address_line      text,
  area              text,
  city              text,
  lat               double precision,
  lng               double precision,
  service_radius_km numeric(5,2) not null default 5,
  opens_at          time not null default '07:00',
  closes_at         time not null default '18:00',
  is_open           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (vendor_id, id),
  constraint branches_main_is_active check (not is_main or active),
  constraint branches_name_nonempty check (length(btrim(name)) > 0)
);
create unique index if not exists branches_one_main on branches (vendor_id) where is_main;
create index if not exists branches_vendor_idx on branches (vendor_id, active);
comment on table branches is 'Shop locations of a vendor business. Orders and branch staff belong to a branch.';

drop trigger if exists branches_updated_at on branches;
create trigger branches_updated_at before update on branches
  for each row execute function set_updated_at();

-- Every vendor gets a main branch from its own location (new vendors too).
create or replace function create_main_branch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into branches (vendor_id, name, is_main, address_line, area, city, lat, lng,
                        service_radius_km, opens_at, closes_at, is_open)
  values (new.id, coalesce(nullif(btrim(new.area), ''), 'Main branch'), true, new.address_line, new.area, new.city,
          new.lat, new.lng, new.service_radius_km, coalesce(new.opens_at, '07:00'), coalesce(new.closes_at, '18:00'),
          new.is_open);
  return new;
end;
$$;
drop trigger if exists vendors_create_main_branch on vendors;
create trigger vendors_create_main_branch after insert on vendors
  for each row execute function create_main_branch();

insert into branches (vendor_id, name, is_main, address_line, area, city, lat, lng,
                      service_radius_km, opens_at, closes_at, is_open, created_at)
select v.id, coalesce(nullif(btrim(v.area), ''), 'Main branch'), true, v.address_line, v.area, v.city, v.lat, v.lng,
       v.service_radius_km, coalesce(v.opens_at, '07:00'), coalesce(v.closes_at, '18:00'), v.is_open, v.created_at
from vendors v
where not exists (select 1 from branches b where b.vendor_id = v.id);

-- Keep the vendor row's location/hours in step with its main branch.
create or replace function mirror_main_branch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_main then
    update vendors set address_line = new.address_line, area = new.area, city = new.city,
                       lat = new.lat, lng = new.lng, service_radius_km = new.service_radius_km,
                       opens_at = new.opens_at, closes_at = new.closes_at, is_open = new.is_open
     where id = new.vendor_id
       and (address_line, area, city, lat, lng, service_radius_km, opens_at, closes_at, is_open)
           is distinct from
           (new.address_line, new.area, new.city, new.lat, new.lng, new.service_radius_km,
            new.opens_at, new.closes_at, new.is_open);
  end if;
  return new;
end;
$$;
drop trigger if exists branches_mirror_main on branches;
create trigger branches_mirror_main after insert or update on branches
  for each row execute function mirror_main_branch();

-- Only a platform admin can move "main" to another branch.
create or replace function guard_branch_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not is_platform_admin() then
    if tg_op = 'INSERT' and new.is_main then
      raise exception 'only a platform admin can create a main branch' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.is_main is distinct from old.is_main or new.vendor_id is distinct from old.vendor_id) then
      raise exception 'only a platform admin can change these branch settings' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists branches_guard_columns on branches;
create trigger branches_guard_columns before insert or update on branches
  for each row execute function guard_branch_columns();

-- ─── 2. Staff belong to a branch (or to the whole business) ────────────────
alter table vendor_memberships add column if not exists branch_id uuid;
alter table vendor_memberships drop constraint if exists vendor_memberships_branch_fk;
alter table vendor_memberships add constraint vendor_memberships_branch_fk
  foreign key (vendor_id, branch_id) references branches (vendor_id, id) on delete set null (branch_id);
comment on column vendor_memberships.branch_id is 'NULL = business-wide (all branches); set = this branch only.';

update vendor_memberships m set branch_id = b.id
  from branches b
 where b.vendor_id = m.vendor_id and b.is_main
   and m.role in ('attendant', 'rider') and m.branch_id is null;

-- ─── 3. Orders belong to a branch ───────────────────────────────────────────
alter table orders add column if not exists branch_id uuid;
update orders o set branch_id = b.id
  from branches b
 where b.vendor_id = o.vendor_id and b.is_main and o.branch_id is null;
alter table orders drop constraint if exists orders_branch_fk;
alter table orders add constraint orders_branch_fk
  foreign key (vendor_id, branch_id) references branches (vendor_id, id);
alter table orders alter column branch_id set not null;
create index if not exists orders_branch_idx on orders (branch_id, status);

create or replace function set_order_branch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null then
    -- the staff member's own branch, if they're tied to one…
    select m.branch_id into new.branch_id
      from vendor_memberships m
     where m.profile_id = auth.uid() and m.vendor_id = new.vendor_id and m.branch_id is not null
     limit 1;
  end if;
  if new.branch_id is null then
    -- …otherwise the main branch.
    select id into new.branch_id from branches where vendor_id = new.vendor_id and is_main;
  end if;
  if tg_op = 'INSERT' and not exists (
       select 1 from branches where id = new.branch_id and vendor_id = new.vendor_id and active) then
    raise exception 'That branch isn''t taking orders.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists orders_set_branch on orders;
create trigger orders_set_branch before insert on orders
  for each row execute function set_order_branch();

-- ─── 4. Access ──────────────────────────────────────────────────────────────
-- Can the current user work on this vendor branch's orders?
create or replace function can_staff_branch(v uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_memberships
                 where profile_id = auth.uid() and vendor_id = v
                   and (branch_id is null or branch_id = b));
$$;

-- "Manager" powers (branches, staff, shared prices, promos, payout account,
-- vendor settings) belong to business-wide managers.
create or replace function is_vendor_manager(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_memberships
                 where profile_id = auth.uid() and vendor_id = v
                   and role = 'vendor_manager' and branch_id is null);
$$;

drop policy if exists orders_read on orders;
create policy orders_read on orders for select
  using (customer_id = auth.uid() or can_staff_branch(vendor_id, branch_id) or is_admin());
drop policy if exists orders_staff_insert on orders;
create policy orders_staff_insert on orders for insert
  with check (can_staff_branch(vendor_id, branch_id));
drop policy if exists orders_staff_update on orders;
create policy orders_staff_update on orders for update
  using (can_staff_branch(vendor_id, branch_id) or is_platform_admin())
  with check (can_staff_branch(vendor_id, branch_id) or is_platform_admin());

-- Branch rows: customers see active branches of verified vendors; staff and
-- admins see all of theirs; business managers and admins manage them.
alter table branches enable row level security;
drop policy if exists branches_read on branches;
create policy branches_read on branches for select
  using ((active and exists (select 1 from vendors v where v.id = vendor_id and v.status = 'verified'))
         or is_vendor_staff(vendor_id) or is_admin());
drop policy if exists branches_manage on branches;
create policy branches_manage on branches for insert
  with check (is_vendor_manager(vendor_id) or is_platform_admin());
drop policy if exists branches_update on branches;
create policy branches_update on branches for update
  using (is_vendor_manager(vendor_id) or is_platform_admin())
  with check (is_vendor_manager(vendor_id) or is_platform_admin());
drop policy if exists branches_admin_delete on branches;
create policy branches_admin_delete on branches for delete using (is_platform_admin());

-- Staff RPCs that bypass RLS: check the branch too.
create or replace function confirm_pickup(p_order uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'order not found'; end if;
  if not (can_staff_branch(o.vendor_id, o.branch_id) or is_admin()) then raise exception 'not authorized'; end if;
  if o.entry_mode <> 'pickup' then raise exception 'not a pickup order'; end if;
  if o.pickup_code is distinct from p_code then raise exception 'pin does not match'; end if;

  update orders set picked_up_at = coalesce(picked_up_at, now()) where id = p_order;
end;
$$;

create or replace function apply_delivery_reschedule(p_order uuid, p_customer_fault boolean)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; pct numeric(5,4) := 0; penalty numeric(12,2) := 0;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'order not found'; end if;
  if not (can_staff_branch(o.vendor_id, o.branch_id) or is_admin()) then raise exception 'not authorized'; end if;

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

-- order_summaries: same columns as 0018 plus the branch, branch-scoped rows.
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
  b.name as branch_name
from orders o
join vendors v on v.id = o.vendor_id
join profiles p on p.id = o.customer_id
left join branches b on b.id = o.branch_id
where o.customer_id = auth.uid() or can_staff_branch(o.vendor_id, o.branch_id) or is_admin();
revoke all on order_summaries from anon;

-- ─── 5. Public profile: include branches ────────────────────────────────────
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
      select jsonb_agg(jsonb_build_object('item', it.name, 'service', pl.service, 'price', pl.price)
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

-- ─── Execute rights ─────────────────────────────────────────────────────────
revoke execute on function create_main_branch(), mirror_main_branch(), guard_branch_columns(), set_order_branch()
  from public, anon, authenticated;
revoke execute on function can_staff_branch(uuid, uuid) from public, anon;
grant execute on function can_staff_branch(uuid, uuid) to authenticated;


-- ─── Self-check for 0033 (always rolled back; aborts the update if anything is off)
-- always rolled back; any failed expectation aborts the whole migration.
do $$
declare
  v uuid; mgr uuid; cust uuid; main_b uuid; b2 uuid; b3 uuid; o1 uuid; o2 uuid; nv uuid;
  out text := ''; bad text := ''; n int;
begin
  if (select count(*) from vendors where not exists (select 1 from branches b where b.vendor_id = vendors.id and b.is_main)) > 0 then
    bad := bad || ' vendor without main branch;';
  end if;
  if exists (select 1 from orders where branch_id is null) then bad := bad || ' order without branch;'; end if;

  select m.vendor_id, m.profile_id into v, mgr from vendor_memberships m where m.role = 'vendor_manager' and m.branch_id is null limit 1;
  select id into cust from profiles where role = 'customer' limit 1;
  if v is not null and cust is not null then
    begin
      select id into main_b from branches where vendor_id = v and is_main;
      insert into vendors (name, area, city) values ('Selftest Wash', 'Ikoyi', 'Lagos') returning id into nv;
      if not exists (select 1 from branches where vendor_id = nv and is_main and name = 'Ikoyi') then bad := bad || ' new vendor main branch;'; end if;
      insert into branches (vendor_id, name, area) values (v, 'Selftest Yaba', 'Yaba') returning id into b2;
      insert into branches (vendor_id, name, area, active) values (v, 'Selftest Closed', 'Ajah', false) returning id into b3;
      insert into orders (customer_id, vendor_id, entry_mode, return_mode, payment_timing, status)
      values (cust, v, 'drop_off', 'collection', 'online', 'awaiting_dropoff') returning id into o1;
      if (select branch_id from orders where id = o1) is distinct from main_b then bad := bad || ' default branch;'; end if;
      insert into orders (customer_id, vendor_id, branch_id, entry_mode, return_mode, payment_timing, status)
      values (cust, v, b2, 'drop_off', 'collection', 'online', 'awaiting_dropoff') returning id into o2;
      begin
        insert into orders (customer_id, vendor_id, branch_id, entry_mode, return_mode, payment_timing, status)
        values (cust, v, b3, 'drop_off', 'collection', 'online', 'awaiting_dropoff');
        bad := bad || ' inactive branch accepted;';
      exception when others then null; end;
      begin
        insert into orders (customer_id, vendor_id, branch_id, entry_mode, return_mode, payment_timing, status)
        values (cust, v, (select id from branches where vendor_id = nv), 'drop_off', 'collection', 'online', 'awaiting_dropoff');
        bad := bad || ' other vendor branch accepted;';
      exception when others then null; end;

      perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      select count(*) into n from orders where id in (o1, o2);
      if n <> 2 then bad := bad || format(' business manager sees %s/2;', n); end if;
      select count(*) into n from order_summaries where id in (o1, o2);
      if n <> 2 then bad := bad || format(' business manager summaries %s/2;', n); end if;
      if not is_vendor_manager(v) then bad := bad || ' business manager not manager;'; end if;
      perform set_config('role', 'postgres', true);

      update vendor_memberships set branch_id = main_b where profile_id = mgr and vendor_id = v;
      perform set_config('role', 'authenticated', true);
      select count(*) into n from orders where id in (o1, o2);
      if n <> 1 then bad := bad || format(' branch-scoped sees %s/2;', n); end if;
      select count(*) into n from order_summaries where id in (o1, o2);
      if n <> 1 then bad := bad || format(' branch-scoped summaries %s;', n); end if;
      if is_vendor_manager(v) then bad := bad || ' branch manager counted as business manager;'; end if;
      begin
        perform confirm_pickup(o2, '0000');
        bad := bad || ' other-branch pickup allowed;';
      exception when others then
        if sqlerrm <> 'not authorized' then bad := bad || ' other-branch pickup: ' || sqlerrm || ';'; end if;
      end;
      begin
        insert into branches (vendor_id, name) values (v, 'Sneaky');
        bad := bad || ' branch manager added a branch;';
      exception when others then null; end;
      update vendor_memberships set branch_id = null where profile_id = mgr and vendor_id = v;
      get diagnostics n = row_count;
      if n <> 0 then bad := bad || ' branch manager made themselves business-wide;'; end if;
      perform set_config('role', 'postgres', true);

      if jsonb_array_length(get_vendor_profile((select slug from vendors where id = v))->'branches')
         <> (select count(*) from branches where vendor_id = v and active) then
        bad := bad || ' profile branch count;';
      end if;
      raise exception 'selftest_done';
    exception when others then
      perform set_config('role', 'postgres', true);
      if sqlerrm <> 'selftest_done' then bad := bad || ' unexpected error: ' || sqlerrm || ';'; end if;
    end;
  end if;

  if bad <> '' then raise exception 'multi-branch self-check failed:%', bad; end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0034 — Partner Agreement with admin-editable clauses.
--
-- The agreement vendors accept (at /apply and Vendor → Verification) used to
-- be one fixed non-circumvention clause in code. It's now the "Partner
-- Agreement": an ordered list of clauses admins manage at Admin → Partner
-- agreement. The existing non-circumvention text is seeded as clause 1.
--
-- platform_settings.agreement_updated_at moves whenever a clause changes,
-- so a vendor who accepted an older version is asked to accept again
-- (vendors.terms_accepted_at < agreement_updated_at).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists agreement_clauses (
  id         uuid primary key default gen_random_uuid(),
  position   int not null default 0,
  title      text not null,
  body       text not null,                       -- paragraphs separated by a blank line
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agreement_clauses_title_nonempty check (length(btrim(title)) > 0),
  constraint agreement_clauses_body_nonempty check (length(btrim(body)) > 0)
);
create index if not exists agreement_clauses_position_idx on agreement_clauses (position);
comment on table agreement_clauses is 'Partner Agreement clauses shown to vendors; managed by platform admins.';

alter table platform_settings add column if not exists agreement_updated_at timestamptz not null default now();

drop trigger if exists agreement_clauses_updated_at on agreement_clauses;
create trigger agreement_clauses_updated_at before update on agreement_clauses
  for each row execute function set_updated_at();

create or replace function touch_agreement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update platform_settings set agreement_updated_at = now() where id;
  return null;
end;
$$;
drop trigger if exists agreement_clauses_touch on agreement_clauses;
create trigger agreement_clauses_touch after insert or update or delete on agreement_clauses
  for each statement execute function touch_agreement();
revoke execute on function touch_agreement() from public, anon, authenticated;

alter table agreement_clauses enable row level security;
drop policy if exists agreement_read on agreement_clauses;
create policy agreement_read on agreement_clauses for select
  using (active or is_platform_admin());
drop policy if exists agreement_admin_write on agreement_clauses;
create policy agreement_admin_write on agreement_clauses for all
  using (is_platform_admin()) with check (is_platform_admin());
grant select on agreement_clauses to anon, authenticated;

-- Seed with the existing non-circumvention clause (once). Seeding must not
-- invalidate acceptances already given, so keep agreement_updated_at at the
-- time of the earliest existing acceptance.
do $$
begin
  if not exists (select 1 from agreement_clauses) then
    insert into agreement_clauses (position, title, body) values (1, 'Non-circumvention',
      'Customers introduced to you through laundriroom are platform customers. For twelve (12) months from a customer’s first order placed with you via laundriroom, you agree to transact all laundry services for that customer through the laundriroom platform.'
      || E'\n\n' ||
      'You will not solicit, divert, or accept such customers’ orders, payments, or contact outside the platform — directly or indirectly, and whether in cash or otherwise — during that period.'
      || E'\n\n' ||
      'Breach may result in withheld or reversed payouts, commission adjustments to recover lost platform fees, suspension, de-listing, and recovery of damages. This obligation survives termination for the period stated and is enforceable against the verified business and its principals named in your ID and CAC records.');
    update platform_settings
       set agreement_updated_at = coalesce(
             (select least(min(terms_accepted_at), now()) from vendors where terms_accepted_at is not null),
             now() - interval '1 second')
     where id;
  end if;
end $$;

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



-- ═══════════════════════════════════════════════════════════════════════════
-- 0036 — Printable tag batches.
--
-- Vendors (and admins on their behalf) generate batches of garment tags,
-- print them as QR codes, and keep a history.
--
-- Tag code format:  PREFIX-VID-NNNNN   e.g.  FPL-7KQ2-00042
--   PREFIX  the vendor's tag prefix (2–5 letters/digits, set by the vendor or
--           admin; defaults to the initials of the vendor's name)
--   VID     a short code unique to the vendor, generated once — so two
--           vendors with the same prefix can never print the same code
--   NNNNN   the vendor's running tag number (never reused)
-- The code is what's printed under the QR and what staff type in.
--
-- 1. vendors.tag_prefix / tag_vid / tag_seq.
-- 2. tag_batches: one row per generated batch (who, when, numbers, prints).
-- 3. tags: batch_id, serial, print tracking, status note; two new statuses
--    'missing' and 'damaged' (kept as they are when an order closes — only
--    in-use tags go back to 'free').
-- 4. generate_tags(vendor, count, prefix?) — business-wide managers and
--    platform admins; numbers are allocated under a row lock, so two people
--    generating at once can't collide.
-- ═══════════════════════════════════════════════════════════════════════════

alter type tag_status add value if not exists 'missing';
alter type tag_status add value if not exists 'damaged';

-- ─── 1. Vendor tag settings ─────────────────────────────────────────────────
alter table vendors add column if not exists tag_prefix text;
alter table vendors add column if not exists tag_vid text;
alter table vendors add column if not exists tag_seq int not null default 0;
alter table vendors drop constraint if exists vendors_tag_prefix_format;
alter table vendors add constraint vendors_tag_prefix_format
  check (tag_prefix is null or tag_prefix ~ '^[A-Z0-9]{2,5}$');
create unique index if not exists vendors_tag_vid_key on vendors (tag_vid);
comment on column vendors.tag_prefix is 'Printed tag codes start with this (2–5 A–Z/0–9).';
comment on column vendors.tag_vid is 'Short code unique to the vendor, the middle part of every tag code.';
comment on column vendors.tag_seq is 'Last tag number used by the vendor.';

-- ─── 2. Batches ─────────────────────────────────────────────────────────────
create table if not exists tag_batches (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references vendors (id) on delete cascade,
  prefix          text not null,
  first_serial    int not null,
  last_serial     int not null,
  quantity        int not null check (quantity between 1 and 500),
  created_by      uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  print_count     int not null default 0,
  last_printed_at timestamptz
);
create index if not exists tag_batches_vendor_idx on tag_batches (vendor_id, created_at desc);
comment on table tag_batches is 'History of generated tag batches (printable as QR sheets).';

-- ─── 3. Tags ────────────────────────────────────────────────────────────────
alter table tags add column if not exists batch_id uuid references tag_batches (id) on delete set null;
alter table tags add column if not exists serial int;
alter table tags add column if not exists print_count int not null default 0;
alter table tags add column if not exists last_printed_at timestamptz;
alter table tags add column if not exists status_note text;
alter table tags add column if not exists status_changed_at timestamptz;
create index if not exists tags_batch_idx on tags (batch_id, serial);
create index if not exists tags_vendor_status_idx on tags (vendor_id, status);

-- Closing an order frees its in-use tags; missing / damaged / retired stay put.
create or replace function on_order_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' then
    update tags t
      set status = 'free', current_item_id = null
      from order_items oi
      where oi.order_id = new.id
        and t.current_item_id = oi.id
        and t.status = 'in_use';

    perform schedule_payout_if_ready(new.id);
  end if;
  return new;
end;
$$;

-- ─── 4. Generate a batch ────────────────────────────────────────────────────
-- Default prefix: initials of the vendor's name ("Fold & Press, Lekki" → FPL).
create or replace function vendor_tag_prefix_default(p_name text) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(left(upper(string_agg(left(w, 1), '')), 5), ''), 'LR')
    from regexp_split_to_table(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 ]', ' ', 'g'), '\s+') w
   where w <> '' and lower(w) not in ('and', 'the', 'of', 'ltd', 'limited');
$$;

create or replace function generate_tags(p_vendor uuid, p_count int, p_prefix text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v vendors%rowtype;
  pfx text;
  vid text;
  first_no int;
  batch uuid;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- no 0/O/1/I: easier to type
begin
  if not (is_vendor_manager(p_vendor) or is_platform_admin()) then
    raise exception 'Only the business''s main manager or a platform admin can generate tags.' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 500 then
    raise exception 'Generate between 1 and 500 tags at a time.' using errcode = '22023';
  end if;

  select * into v from vendors where id = p_vendor for update;
  if v.id is null then raise exception 'vendor not found'; end if;

  pfx := upper(btrim(coalesce(nullif(btrim(p_prefix), ''), v.tag_prefix, vendor_tag_prefix_default(v.name))));
  if pfx !~ '^[A-Z0-9]{2,5}$' then
    raise exception 'Use 2–5 letters or numbers for the tag prefix.' using errcode = '22023';
  end if;

  vid := v.tag_vid;
  while vid is null loop
    vid := '';
    for i in 1..4 loop
      vid := vid || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if exists (select 1 from vendors where tag_vid = vid) then vid := null; end if;
  end loop;

  first_no := v.tag_seq + 1;
  update vendors set tag_prefix = pfx, tag_vid = vid, tag_seq = v.tag_seq + p_count where id = p_vendor;

  insert into tag_batches (vendor_id, prefix, first_serial, last_serial, quantity, created_by)
  values (p_vendor, pfx, first_no, first_no + p_count - 1, p_count, auth.uid())
  returning id into batch;

  insert into tags (code, batch, batch_id, serial, status, vendor_id)
  select format('%s-%s-%s', pfx, vid, lpad(n::text, 5, '0')), batch::text, batch, n, 'free', p_vendor
    from generate_series(first_no, first_no + p_count - 1) n;

  return batch;
end;
$$;

revoke execute on function generate_tags(uuid, int, text) from public, anon;
grant execute on function generate_tags(uuid, int, text) to authenticated;
revoke execute on function vendor_tag_prefix_default(text) from public, anon;

-- Vendor tag columns: a business manager may set the prefix; only the
-- generator moves the counter and the vendor code.
create or replace function guard_vendor_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not is_platform_admin() then
    if new.status                   is distinct from old.status
    or new.plan_id                  is distinct from old.plan_id
    or new.kyc_verified             is distinct from old.kyc_verified
    or new.slug                     is distinct from old.slug
    or new.tag_vid                  is distinct from old.tag_vid
    or new.tag_seq                  is distinct from old.tag_seq
    then
      raise exception 'only a platform admin can change these vendor settings' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function guard_vendor_columns() from public, anon, authenticated;

-- ─── Access ─────────────────────────────────────────────────────────────────
alter table tag_batches enable row level security;
drop policy if exists tag_batches_read on tag_batches;
create policy tag_batches_read on tag_batches for select
  using (is_vendor_staff(vendor_id) or is_admin());
-- Print tracking only (rows are created by generate_tags).
drop policy if exists tag_batches_update on tag_batches;
create policy tag_batches_update on tag_batches for update
  using (is_vendor_staff(vendor_id) or is_platform_admin())
  with check (is_vendor_staff(vendor_id) or is_platform_admin());

-- ─── Self-check for 0036 (aborts the update if anything is off) ────────────
do $$
begin
  if vendor_tag_prefix_default('Fold & Press, Lekki') <> 'FPL' then raise exception 'self-check: tag prefix'; end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'tag_status' and e.enumlabel = 'damaged')
    then raise exception 'self-check: tag_status'; end if;
  if to_regclass('public.tag_batches') is null then raise exception 'self-check: tag_batches'; end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0037 — Notification events for review quality (values only; the rules that
-- use them are in 0038, since Postgres can't use a new enum value in the same
-- transaction that adds it).
--   review_low        a 1–2★ review: tell the vendor (and admins)
--   vendor_inquiry    admin asks the vendor what's going on
--   vendor_warning    admin warns the vendor
--   vendor_suspended  admin suspends the vendor for repeated bad reviews
-- ═══════════════════════════════════════════════════════════════════════════
alter type notif_event add value if not exists 'review_low';
alter type notif_event add value if not exists 'vendor_inquiry';
alter type notif_event add value if not exists 'vendor_warning';
alter type notif_event add value if not exists 'vendor_suspended';

-- Record 0033–0037 in the migration history.
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0033', 'multi_branch_vendors', '{}'), ('0034', 'partner_agreement', '{}'),
       ('0035', 'distance_delivery_pricing', '{}'), ('0036', 'tag_batches', '{}'),
       ('0037', 'review_quality_events', '{}')
on conflict (version) do nothing;

commit;

-- ═══ PART 2 of 2 ═══════════════════════════════════════════════════════════
begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0038 — Bad reviews: tell the vendor, flag to admins, escalate in steps.
--
-- A "bad" review is 1 or 2 stars.
-- 1. Every bad review emails/WhatsApps the vendor (that branch's staff and
--    business-wide staff) asking them to look into it, contact the customer
--    and resolve it promptly — and alerts admins (event review_low). The app
--    fires it when the review is saved.
-- 2. get_review_watchlist() — admins: per vendor, bad reviews in the last 30
--    days vs the 30 days before, last 90 days, average ratings, and a level:
--      flagged  3+ bad in 30 days, or 2+ and more than the previous 30 days
--               (rising), or 30%+ of 5+ reviews in 30 days were bad
--      watch    at least one bad review in 30 days
--    plus the current escalation step.
-- 3. vendor_quality_actions — the escalation trail an admin takes:
--      inquiry → warning → suspension (and 'resolved' to close a case).
--    Each step messages the vendor; suspension also sets the vendor's status.
--    The vendor's main manager can reply to an inquiry/warning in the app
--    (respond_quality_action).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Notification rules + WhatsApp text ─────────────────────────────────────
insert into notification_rules (event, channels, fallback_order, recipients, enabled)
select e::notif_event, '{email,whatsapp}'::notif_channel[], '{whatsapp,email}'::notif_channel[], r::text[], true
from (values ('review_low', '{vendor,admin}'), ('vendor_inquiry', '{vendor}'),
             ('vendor_warning', '{vendor}'), ('vendor_suspended', '{vendor}')) as x(e, r)
where not exists (select 1 from notification_rules n where n.event = x.e::notif_event);

insert into notification_templates (event, channel, subject, body)
select x.e::notif_event, 'whatsapp', null, x.b
from (values
  ('review_low', 'laundriroom: order {{order_code}} at {{vendor_name}} got a {{rating}}★ review: "{{review_comment}}". Please look into it, contact the customer ({{customer_phone}}) and resolve it promptly.'),
  ('vendor_inquiry', 'laundriroom: we''d like to understand recent customer reviews at {{vendor_name}}. {{action_message}} Please reply in your dashboard: {{reviews_url}}'),
  ('vendor_warning', 'laundriroom WARNING for {{vendor_name}}: {{action_message}} Continued bad reviews may lead to suspension. Respond in your dashboard: {{reviews_url}}'),
  ('vendor_suspended', 'laundriroom: {{vendor_name}} has been suspended from the platform. {{action_message}} Contact support to discuss: {{support_url}}')
) as x(e, b)
where not exists (select 1 from notification_templates t where t.event = x.e::notif_event and t.channel = 'whatsapp');

-- ─── Escalation trail ───────────────────────────────────────────────────────
create table if not exists vendor_quality_actions (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references vendors (id) on delete cascade,
  stage           text not null check (stage in ('inquiry', 'warning', 'suspension', 'resolved')),
  message         text not null check (length(btrim(message)) > 0),
  created_by      uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  vendor_response text,
  responded_by    uuid references profiles (id) on delete set null,
  responded_at    timestamptz
);
create index if not exists vendor_quality_actions_vendor_idx on vendor_quality_actions (vendor_id, created_at desc);
comment on table vendor_quality_actions is 'Admin steps on a vendor with bad reviews: inquiry → warning → suspension, or resolved.';

alter table vendor_quality_actions enable row level security;
drop policy if exists vqa_read on vendor_quality_actions;
create policy vqa_read on vendor_quality_actions for select using (is_vendor_staff(vendor_id) or is_admin());
drop policy if exists vqa_admin_write on vendor_quality_actions;
create policy vqa_admin_write on vendor_quality_actions for all
  using (is_platform_admin()) with check (is_platform_admin());

-- The vendor's main manager answers an inquiry or warning.
create or replace function respond_quality_action(p_action uuid, p_response text) returns void
language plpgsql security definer set search_path = public as $$
declare a vendor_quality_actions%rowtype;
begin
  select * into a from vendor_quality_actions where id = p_action;
  if a.id is null then raise exception 'not found'; end if;
  if not is_vendor_manager(a.vendor_id) then raise exception 'Only the business''s main manager can respond.' using errcode = '42501'; end if;
  if a.stage not in ('inquiry', 'warning') then raise exception 'This step doesn''t take a response.'; end if;
  if length(btrim(coalesce(p_response, ''))) < 10 then raise exception 'Please write a short explanation (10+ characters).'; end if;
  update vendor_quality_actions
     set vendor_response = left(btrim(p_response), 4000), responded_by = auth.uid(), responded_at = now()
   where id = p_action;
end;
$$;
revoke execute on function respond_quality_action(uuid, text) from public, anon;
grant execute on function respond_quality_action(uuid, text) to authenticated;

-- ─── Watchlist ──────────────────────────────────────────────────────────────
create or replace function get_review_watchlist()
returns table (
  vendor_id uuid, vendor_name text, vendor_status vendor_status,
  reviews_30 int, bad_30 int, bad_prev_30 int, bad_90 int,
  avg_30 numeric, avg_all numeric, reviews_all int, last_bad_at timestamptz,
  level text, reason text, stage text, stage_at timestamptz, vendor_responded boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return query
  with s as (
    select v.id, v.name, v.status,
      count(r.*) filter (where r.created_at > now() - interval '30 days')::int as r30,
      count(r.*) filter (where r.rating <= 2 and r.created_at > now() - interval '30 days')::int as b30,
      count(r.*) filter (where r.rating <= 2 and r.created_at <= now() - interval '30 days'
                                            and r.created_at > now() - interval '60 days')::int as bp30,
      count(r.*) filter (where r.rating <= 2 and r.created_at > now() - interval '90 days')::int as b90,
      round(avg(r.rating) filter (where r.created_at > now() - interval '30 days'), 1) as a30,
      round(avg(r.rating), 1) as aall,
      count(r.*)::int as rall,
      max(r.created_at) filter (where r.rating <= 2) as lastbad
    from vendors v left join reviews r on r.vendor_id = v.id
    group by v.id
  ), a as (
    select distinct on (q.vendor_id) q.vendor_id, q.stage, q.created_at, q.vendor_response is not null as responded
      from vendor_quality_actions q order by q.vendor_id, q.created_at desc
  ), lv as (
    select s.*, a.stage as st, a.created_at as st_at, coalesce(a.responded, false) as resp,
      case
        when s.b30 >= 3 then 'flagged'
        when s.b30 >= 2 and s.b30 > s.bp30 then 'flagged'
        when s.r30 >= 5 and s.b30::numeric / s.r30 >= 0.3 then 'flagged'
        when s.b30 >= 1 then 'watch'
        else 'ok' end as lvl,
      case
        when s.b30 >= 3 then format('%s bad reviews in the last 30 days', s.b30)
        when s.b30 >= 2 and s.b30 > s.bp30 then format('Bad reviews rising: %s in the last 30 days (was %s)', s.b30, s.bp30)
        when s.r30 >= 5 and s.b30::numeric / s.r30 >= 0.3 then format('%s%% of recent reviews are bad', round(100.0 * s.b30 / s.r30))
        when s.b30 >= 1 then format('%s bad review%s in the last 30 days', s.b30, case when s.b30 = 1 then '' else 's' end)
        else '' end as why
    from s left join a on a.vendor_id = s.id
  )
  select lv.id, lv.name, lv.status, lv.r30, lv.b30, lv.bp30, lv.b90, lv.a30, lv.aall, lv.rall, lv.lastbad,
         lv.lvl, lv.why, lv.st, lv.st_at, lv.resp
    from lv
   where lv.lvl <> 'ok' or (lv.st is not null and lv.st <> 'resolved')
   order by case lv.lvl when 'flagged' then 0 when 'watch' then 1 else 2 end, lv.b30 desc, lv.lastbad desc nulls last;
end;
$$;
revoke execute on function get_review_watchlist() from public, anon;
grant execute on function get_review_watchlist() to authenticated;

-- ─── Self-check for 0038 ────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from notification_rules where event in ('review_low','vendor_inquiry','vendor_warning','vendor_suspended')) <> 4
    then raise exception 'self-check: notification rules'; end if;
  if to_regclass('public.vendor_quality_actions') is null then raise exception 'self-check: vendor_quality_actions'; end if;
  if to_regprocedure('public.get_review_watchlist()') is null then raise exception 'self-check: get_review_watchlist'; end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0038', 'review_quality', '{}')
on conflict (version) do nothing;

commit;
