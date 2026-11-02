-- Run this AFTER creating demo users via sign-up or the Supabase dashboard.
-- Replace the emails with the ones you created. It promotes an admin, and makes
-- a manager + attendant for the demo vendor.
--
--   psql "$DATABASE_URL" -f scripts/seed-demo-roles.sql
-- or paste into the Supabase SQL editor.

-- 1) Platform admin
update profiles set role = 'platform_admin', email_verified = true
where email = 'admin@fresco.example';

-- 2) Vendor manager + attendant for "Fold & Press, Lekki"
update profiles set role = 'vendor_manager' where email = 'manager@fresco.example';
update profiles set role = 'attendant'      where email = 'attendant@fresco.example';

insert into vendor_memberships (vendor_id, profile_id, role)
select '00000000-0000-0000-0000-00000000f01d', id, 'vendor_manager'
from profiles where email = 'manager@fresco.example'
on conflict do nothing;

insert into vendor_memberships (vendor_id, profile_id, role)
select '00000000-0000-0000-0000-00000000f01d', id, 'attendant'
from profiles where email = 'attendant@fresco.example'
on conflict do nothing;
