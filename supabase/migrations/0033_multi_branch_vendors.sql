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
