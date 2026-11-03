-- ═══════════════════════════════════════════════════════════════════════════
-- 0031 — Public vendor profile pages (laundriroom.app/v/<slug>).
--
-- 1. vendors.slug — the vendor's shareable link name. Generated from the
--    vendor's name the moment the vendor row is created (application
--    approval, admin "Add vendor", seed), made unique with -2, -3…, and kept
--    when the vendor is renamed so links already shared keep working. Only a
--    platform admin can change it (guard_vendor_columns), so nobody can claim
--    a misleading name.
-- 2. orders.via_vendor_link — true when the customer placed the order from
--    the vendor's profile link, so vendors can see what their link brings in
--    (and the platform can tell vendor-introduced customers from
--    platform-introduced ones).
-- 3. get_vendor_profile(slug) — the public, read-only profile: name,
--    location, hours, verified badge, rating summary + recent reviews
--    (reviewer first name + initial only) and the active price list. Anyone
--    can call it, including signed-out visitors; it only ever returns
--    vendors that are verified or pending (suspended/rejected → null).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Slugs ───────────────────────────────────────────────────────────────
alter table vendors add column if not exists slug text;

create or replace function vendor_slug_base(p_name text) returns text
language sql immutable set search_path = public as $$
  select coalesce(
    nullif(
      left(
        trim(both '-' from regexp_replace(
          replace(lower(coalesce(p_name, '')), '&', ' and '),
          '[^a-z0-9]+', '-', 'g')),
        48),
      ''),
    'laundry');
$$;

create or replace function unique_vendor_slug(p_name text, p_vendor uuid) returns text
language plpgsql set search_path = public as $$
declare
  base text := trim(both '-' from vendor_slug_base(p_name));
  candidate text;
  n int := 1;
begin
  if length(base) < 3 then base := base || '-laundry'; end if;
  candidate := base;
  while exists (select 1 from vendors where slug = candidate and id is distinct from p_vendor) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- security definer: the uniqueness check must see every vendor regardless of
-- the caller's RLS, and the helper functions aren't executable by app roles.
create or replace function set_vendor_slug() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := unique_vendor_slug(new.name, new.id);
  else
    new.slug := lower(btrim(new.slug));
  end if;
  return new;
end;
$$;

create or replace trigger vendors_set_slug before insert or update of slug on vendors
  for each row execute function set_vendor_slug();

-- Backfill existing vendors, oldest first (so the first gets the plain name).
do $$
declare v record;
begin
  for v in select id, name from vendors where slug is null order by created_at, id loop
    update vendors set slug = unique_vendor_slug(v.name, v.id) where id = v.id;
  end loop;
end;
$$;

alter table vendors alter column slug set not null;
create unique index if not exists vendors_slug_key on vendors (slug);
alter table vendors drop constraint if exists vendors_slug_format;
alter table vendors add constraint vendors_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60);
comment on column vendors.slug is 'Shareable profile link name: /v/<slug>. Auto-generated; admin-only to change.';

-- Only a platform admin can change the slug (as well as status/plan/KYC).
create or replace function guard_vendor_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not is_platform_admin() then
    if new.status                   is distinct from old.status
    or new.plan_id                  is distinct from old.plan_id
    or new.kyc_verified             is distinct from old.kyc_verified
    or new.slug                     is distinct from old.slug
    then
      raise exception 'only a platform admin can change these vendor settings' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function vendor_slug_base(text), unique_vendor_slug(text, uuid), set_vendor_slug(), guard_vendor_columns()
  from public, anon, authenticated;

-- ─── 2. Orders placed from a vendor's link ──────────────────────────────────
alter table orders add column if not exists via_vendor_link boolean not null default false;
comment on column orders.via_vendor_link is 'Placed from the vendor''s public profile link (/v/<slug>).';

-- ─── 3. The public profile ──────────────────────────────────────────────────
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
