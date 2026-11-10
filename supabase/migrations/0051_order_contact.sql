-- 0051_order_contact.sql
--
-- Backend order follow-up: admins and the order's own vendor staff need the
-- customer's contact details to chase incomplete orders. Vendor staff can't
-- read customer `profiles` directly (RLS is self/admin only), so expose a
-- narrow, authorized SECURITY DEFINER accessor that returns just the contact
-- fields for one order — to platform admins/support and to that order's vendor
-- staff (branch-scoped), and no one else.

create or replace function get_order_contact(p_order uuid)
returns table (
  customer_id   uuid,
  full_name     text,
  phone         text,
  email         text,
  address_label text,
  address_line  text,
  address_area  text,
  address_city  text
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.full_name, p.phone, p.email::text,
    a.label, a.line1, a.area, a.city
  from orders o
  join profiles p on p.id = o.customer_id
  left join customer_addresses a on a.id = o.pickup_address_id
  where o.id = p_order
    and (
      is_admin()
      or (is_vendor_staff(o.vendor_id) and can_staff_branch(o.vendor_id, o.branch_id))
    );
$$;

revoke execute on function get_order_contact(uuid) from public, anon;
grant execute on function get_order_contact(uuid) to authenticated;
