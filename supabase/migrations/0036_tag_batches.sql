-- ═══════════════════════════════════════════════════════════════════════════
-- 0036 — Printable tag batches.
--
-- Vendors (and admins on their behalf) generate batches of garment tags,
-- print them as QR codes, and keep a history.
--
-- Tag code format:  PREFIX-NNNN   e.g.  FPL-0042
--   PREFIX  set automatically from the vendor's name when the vendor is
--           created (initials: "Fold & Press, Lekki" → FPL; one-word names
--           use the first 3 letters). It is unique to the vendor — a second
--           "FPL" business gets FPL2 — and stays the same if the name changes.
--   NNNN    the vendor's running tag number, 4 digits (grows past 9999),
--           never reused.
-- The code is what's printed under the QR and what staff type in.
--
-- 1. vendors.tag_prefix (unique, automatic) / tag_seq.
-- 2. tag_batches: one row per generated batch (who, when, numbers, prints).
-- 3. tags: batch_id, serial, print tracking, status note; two new statuses
--    'missing' and 'damaged' (kept as they are when an order closes — only
--    in-use tags go back to 'free').
-- 4. generate_tags(vendor, count) — business-wide managers and
--    platform admins; numbers are allocated under a row lock, so two people
--    generating at once can't collide.
-- ═══════════════════════════════════════════════════════════════════════════

alter type tag_status add value if not exists 'missing';
alter type tag_status add value if not exists 'damaged';

-- ─── 1. Vendor tag settings ─────────────────────────────────────────────────
alter table vendors add column if not exists tag_prefix text;
alter table vendors add column if not exists tag_seq int not null default 0;
alter table vendors drop constraint if exists vendors_tag_prefix_format;
alter table vendors add constraint vendors_tag_prefix_format
  check (tag_prefix is null or tag_prefix ~ '^[A-Z0-9]{2,6}$');
create unique index if not exists vendors_tag_prefix_key on vendors (tag_prefix);
comment on column vendors.tag_prefix is 'Tag codes start with this; set from the name, unique per vendor.';
comment on column vendors.tag_seq is 'Last tag number used by the vendor.';

-- Initials of the name ("Fold & Press, Lekki" → FPL, up to 4); a one-word
-- name gives its first 3 letters ("Bubbles" → BUB).
create or replace function vendor_tag_prefix_base(p_name text) returns text
language sql immutable set search_path = public as $$
  with w as (
    select x, ord
      from regexp_split_to_table(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 ]', ' ', 'g')), '\s+')
           with ordinality as t(x, ord)
     where x <> '' and lower(x) not in ('and', 'the', 'of', 'ltd', 'limited', 'plc', 'nig', 'co')
  ), r as (
    select case
      when (select count(*) from w) >= 2 then left((select string_agg(left(x, 1), '' order by ord) from w), 4)
      when (select count(*) from w) = 1  then left((select x from w), 3)
      else 'LR' end as v
  )
  select case when length(v) < 2 then rpad(v, 2, 'X') else v end from r;  -- rpad alone would cut longer ones
$$;

-- The base prefix, or base2, base3… if another vendor already has it.
create or replace function next_tag_prefix(p_name text, p_vendor uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  base text := vendor_tag_prefix_base(p_name);
  cand text := base;
  n int := 1;
begin
  while exists (select 1 from vendors where tag_prefix = cand and id is distinct from p_vendor) loop
    n := n + 1;
    cand := left(base, 6 - length(n::text)) || n;
  end loop;
  return cand;
end;
$$;

create or replace function set_vendor_tag_prefix() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tag_prefix is null then
    new.tag_prefix := next_tag_prefix(new.name, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists vendors_set_tag_prefix on vendors;
create trigger vendors_set_tag_prefix before insert on vendors
  for each row execute function set_vendor_tag_prefix();

-- Existing vendors, oldest first (so the earlier business keeps the plain prefix).
do $$
declare r record;
begin
  for r in select id, name from vendors where tag_prefix is null order by created_at, id loop
    update vendors set tag_prefix = next_tag_prefix(r.name, r.id) where id = r.id;
  end loop;
end $$;

revoke execute on function next_tag_prefix(text, uuid) from public, anon, authenticated;
revoke execute on function set_vendor_tag_prefix() from public, anon, authenticated;
revoke execute on function vendor_tag_prefix_base(text) from public, anon;

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
drop function if exists generate_tags(uuid, int, text);
create or replace function generate_tags(p_vendor uuid, p_count int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v vendors%rowtype;
  pfx text;
  n int;
  made int := 0;
  first_no int;
  batch uuid;
begin
  if not (is_vendor_manager(p_vendor) or is_platform_admin()) then
    raise exception 'Only the business''s main manager or a platform admin can generate tags.' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 500 then
    raise exception 'Generate between 1 and 500 tags at a time.' using errcode = '22023';
  end if;

  -- Row lock: two people generating at once get different numbers.
  select * into v from vendors where id = p_vendor for update;
  if v.id is null then raise exception 'vendor not found'; end if;
  pfx := coalesce(v.tag_prefix, next_tag_prefix(v.name, v.id));

  insert into tag_batches (vendor_id, prefix, first_serial, last_serial, quantity, created_by)
  values (p_vendor, pfx, v.tag_seq + 1, v.tag_seq + p_count, p_count, auth.uid())
  returning id into batch;

  -- Numbers whose code already exists (e.g. older hand-made tags) are skipped.
  n := v.tag_seq;
  while made < p_count loop
    n := n + 1;
    insert into tags (code, batch, batch_id, serial, status, vendor_id)
    values (pfx || '-' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end,
            batch::text, batch, n, 'free', p_vendor)
    on conflict (code) do nothing;
    if found then
      made := made + 1;
      first_no := coalesce(first_no, n);
    end if;
  end loop;

  update vendors set tag_prefix = pfx, tag_seq = n where id = p_vendor;
  update tag_batches set first_serial = first_no, last_serial = n where id = batch;
  return batch;
end;
$$;

revoke execute on function generate_tags(uuid, int) from public, anon;
grant execute on function generate_tags(uuid, int) to authenticated;

-- Vendor tag columns: the prefix is automatic and the counter only moves when
-- tags are generated — vendors can't change either.
create or replace function guard_vendor_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not is_platform_admin() then
    if new.status                   is distinct from old.status
    or new.plan_id                  is distinct from old.plan_id
    or new.kyc_verified             is distinct from old.kyc_verified
    or new.slug                     is distinct from old.slug
    or new.tag_prefix               is distinct from old.tag_prefix
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
