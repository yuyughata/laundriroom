-- ============================================================================
-- 0007  Admin metrics + user directory helpers
-- A guarded aggregate for the admin dashboard home, and a view that joins a
-- staff member to their vendor for the user-management screen.
-- ============================================================================

-- Platform totals for the admin home. SECURITY DEFINER so it can aggregate
-- across all tenants, but it refuses anyone who is not admin/support.
create or replace function get_platform_metrics() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  return (select json_build_object(
    'vendors_total',     (select count(*) from vendors),
    'vendors_pending',   (select count(*) from vendors where status = 'pending'),
    'vendors_verified',  (select count(*) from vendors where status = 'verified'),
    'customers',         (select count(*) from profiles where role = 'customer'),
    'staff',             (select count(*) from profiles where role in ('attendant','vendor_manager','rider')),
    'orders_total',      (select count(*) from orders),
    'orders_open',       (select count(*) from orders where status not in ('closed','cancelled')),
    'orders_closed',     (select count(*) from orders where status = 'closed'),
    'orders_today',      (select count(*) from orders
                            where (created_at at time zone 'Africa/Lagos')::date
                                = (now() at time zone 'Africa/Lagos')::date),
    'revenue_collected', (select coalesce(sum(amount), 0) from payments where status = 'succeeded'),
    'payouts_due_net',   (select coalesce(sum(net), 0) from payouts where status in ('due','held')),
    'payouts_due_count', (select count(*) from payouts where status in ('due','held'))
  ));
end;
$$;

-- A directory row per person, with their vendor (if staff). Underlying RLS on
-- profiles still applies, so only admins see everyone; a normal user sees self.
create or replace view user_directory as
select
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.role,
  p.status,
  p.email_verified,
  p.created_at,
  vm.vendor_id,
  v.name as vendor_name
from profiles p
left join vendor_memberships vm on vm.profile_id = p.id
left join vendors v on v.id = vm.vendor_id;
