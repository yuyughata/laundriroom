-- ═══════════════════════════════════════════════════════════════════════════
-- 0030 — Vendors can create orders for walk-in / phone customers.
--
-- 1. orders.created_by records who entered the order (the customer, or the
--    vendor staff member). Set by a trigger from auth.uid(), so a client
--    can't fake it; NULL for orders created by server code.
-- 2. find_customer_for_vendor(query): vendor staff look a customer up by an
--    exact email or phone number (any format — the last 10 digits are
--    compared). Exact matches only, at most 5, active customers only, email
--    masked: enough to confirm "is this you?", not to browse customers.
-- Inserting the order itself already works for staff (orders_staff_insert).
-- ═══════════════════════════════════════════════════════════════════════════

alter table orders add column if not exists created_by uuid references profiles (id) on delete set null;
create index if not exists orders_created_by_idx on orders (created_by);
comment on column orders.created_by is 'Who entered the order: the customer, or the vendor staff member who created it for them.';

create or replace function set_order_created_by() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace trigger orders_set_created_by before insert on orders
  for each row execute function set_order_created_by();

revoke execute on function set_order_created_by() from public, anon, authenticated;

create or replace function find_customer_for_vendor(p_query text)
returns table (id uuid, full_name text, phone text, email_hint text)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := trim(coalesce(p_query, ''));
  digits text := regexp_replace(trim(coalesce(p_query, '')), '\D', '', 'g');
begin
  if not exists (select 1 from vendor_memberships where profile_id = auth.uid()) then
    raise exception 'vendor staff only' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.phone,
         case when p.email is null then null
              else left(p.email::text, 1) || '•••' || substr(p.email::text, position('@' in p.email::text))
         end
    from profiles p
   where p.role = 'customer' and p.status = 'active'
     and (
       (position('@' in q) > 0 and lower(p.email::text) = lower(q))
       or (length(digits) >= 10
           and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = right(digits, 10))
     )
   order by p.created_at
   limit 5;
end;
$$;

revoke execute on function find_customer_for_vendor(text) from public, anon;
grant execute on function find_customer_for_vendor(text) to authenticated;
