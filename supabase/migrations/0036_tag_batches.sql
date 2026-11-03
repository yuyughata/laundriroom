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
