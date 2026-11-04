-- ═══════════════════════════════════════════════════════════════════════════
-- 0045  Rider contacts
--   A laundry's list of riders it uses: its own riders and dispatch-company
--   riders (name, phone, company). Riders don't sign in — this is a contact
--   list, not Team. One list per business; a contact can belong to one branch
--   (branch staff see their branch's riders plus the business-wide ones).
--   • Any staff member can see the list and add a rider (on the spot, from an
--     order). Only managers edit or archive (a branch manager: their branch's).
--   • assign_order_rider(): put a rider on an order — a saved contact, or a
--     name + phone, optionally saved to the list. The order keeps its own copy
--     of the name/phone, so editing or archiving a contact never changes
--     past orders. Phones are matched by digits (0803… = +234 803…), so the
--     same rider isn't saved twice.
--   Drop-free; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- Nigerian-friendly phone key: digits only, 0XXXXXXXXXX → 234XXXXXXXXXX.
create or replace function phone_key(p text) returns text
language sql immutable set search_path = public as $$
  select case
    when d ~ '^0[0-9]{10}$' then '234' || substr(d, 2)
    else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

create table if not exists rider_contacts (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors (id) on delete cascade,
  branch_id    uuid references branches (id) on delete set null,   -- null = every branch
  name         text not null check (length(btrim(name)) between 1 and 80),
  phone        text not null check (length(btrim(phone)) between 5 and 30),
  phone_key    text generated always as (phone_key(phone)) stored,
  kind         text not null default 'own' check (kind in ('own', 'dispatch')),
  company      text check (company is null or length(company) <= 80),
  notes        text check (notes is null or length(notes) <= 300),
  active       boolean not null default true,
  created_by   uuid default auth.uid() references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create unique index if not exists rider_contacts_vendor_phone_key on rider_contacts (vendor_id, phone_key);
create index if not exists rider_contacts_vendor_idx on rider_contacts (vendor_id, active);
comment on table rider_contacts is 'A laundry''s saved riders (own or dispatch). Staff add; managers edit/archive. Riders have no login.';

alter table orders add column if not exists rider_contact_id uuid references rider_contacts (id) on delete set null;
create index if not exists orders_rider_contact_idx on orders (rider_contact_id) where rider_contact_id is not null;

-- Is the signed-in user a manager for this contact's branch? (business-wide
-- managers: any branch; branch managers: their own branch's contacts only)
create or replace function can_manage_riders(v uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_memberships
                  where profile_id = auth.uid() and vendor_id = v and role = 'vendor_manager'
                    and (branch_id is null or (b is not null and branch_id = b)));
$$;
revoke execute on function can_manage_riders(uuid, uuid) from public, anon;
grant execute on function can_manage_riders(uuid, uuid) to authenticated;

alter table rider_contacts enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'rider_contacts' and policyname = 'riders_read') then
    create policy riders_read on rider_contacts for select
      using (is_admin() or (is_vendor_staff(vendor_id) and (branch_id is null or can_staff_branch(vendor_id, branch_id))));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rider_contacts' and policyname = 'riders_staff_add') then
    create policy riders_staff_add on rider_contacts for insert
      with check (is_admin() or (is_vendor_staff(vendor_id) and (branch_id is null or can_staff_branch(vendor_id, branch_id))));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rider_contacts' and policyname = 'riders_manager_edit') then
    create policy riders_manager_edit on rider_contacts for update
      using (is_admin() or can_manage_riders(vendor_id, branch_id))
      with check (is_admin() or can_manage_riders(vendor_id, branch_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rider_contacts' and policyname = 'riders_manager_delete') then
    create policy riders_manager_delete on rider_contacts for delete
      using (is_admin() or can_manage_riders(vendor_id, branch_id));
  end if;
end $$;

-- Who added it and which laundry it belongs to never change; keep updated_at.
create or replace function guard_rider_contact() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then new.created_by := auth.uid(); end if;
    new.name := btrim(new.name); new.phone := btrim(new.phone);
    new.company := nullif(btrim(coalesce(new.company, '')), '');
    return new;
  end if;
  new.vendor_id := old.vendor_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.name := btrim(new.name); new.phone := btrim(new.phone);
  new.company := nullif(btrim(coalesce(new.company, '')), '');
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function guard_rider_contact() from public, anon, authenticated;
create or replace trigger rider_contacts_guard before insert or update on rider_contacts
  for each row execute function guard_rider_contact();

-- ─── Put a rider on an order ────────────────────────────────────────────────
-- p_contact: a saved rider; or p_name + p_phone (+ kind/company) for a new
-- one, saved to the list when p_save. An existing contact with the same phone
-- is reused (and brought back if it was archived). Empty name + phone clears
-- the rider. Staff of the order's branch (or admins) only.
create or replace function assign_order_rider(
  p_order uuid, p_contact uuid default null,
  p_name text default null, p_phone text default null,
  p_kind text default 'own', p_company text default null, p_save boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; c rider_contacts%rowtype; my_branch uuid; is_branch_staff boolean;
  nm text := btrim(coalesce(p_name, '')); ph text := btrim(coalesce(p_phone, ''));
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
  elsif nm = '' and ph = '' then
    update orders set rider_name = null, rider_phone = null, rider_contact_id = null where id = p_order;
    return null;
  else
    if nm = '' then raise exception 'Enter the rider''s name.'; end if;
    if length(phone_key(ph)) < 7 then raise exception 'Enter the rider''s phone number.'; end if;
    if p_kind not in ('own', 'dispatch') then raise exception 'bad rider type'; end if;
    if p_save then
      select * into c from rider_contacts where vendor_id = o.vendor_id and phone_key = phone_key(ph);
      if c.id is null then
        -- new contact: a branch-only staff member's riders belong to their branch
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
         rider_phone = coalesce(c.phone, ph)
   where id = p_order;
  if c.id is not null then update rider_contacts set last_used_at = now() where id = c.id; end if;
  return c.id;
end;
$$;
revoke execute on function assign_order_rider(uuid, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function assign_order_rider(uuid, uuid, text, text, text, text, boolean) to authenticated;
