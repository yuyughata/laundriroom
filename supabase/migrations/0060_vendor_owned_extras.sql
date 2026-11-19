-- 0060_vendor_owned_extras.sql
--
-- Premium extras become per-vendor: each laundry defines and prices its own
-- premium services (Vendor → Items → Premium extras). The old global,
-- admin-defined list is retired — existing active globals are copied to every
-- vendor as a starting point, then the originals are deactivated.
--
--   service_extras.vendor_id  the owning vendor (NULL = retired legacy global)
--
-- RLS: active extras are readable (customers pick them when ordering); a
-- business-wide vendor manager (or a platform admin) manages their own vendor's
-- extras — mirrors the branches policies.

alter table service_extras
  add column if not exists vendor_id uuid references vendors(id) on delete cascade;
create index if not exists service_extras_vendor_idx on service_extras(vendor_id);

-- Seed every vendor with a copy of the existing active global extras, once,
-- then retire the globals. Idempotent: after the first run there are no active
-- global rows left to copy.
insert into service_extras (vendor_id, name, description, price, active, price_type, percent)
  select v.id, se.name, se.description, se.price, se.active, se.price_type, se.percent
  from service_extras se cross join vendors v
  where se.vendor_id is null and se.active;
update service_extras set active = false where vendor_id is null and active;

-- Read: anyone may see active extras; vendor staff and admins see their own
-- inactive ones too. Write: business-wide manager of that vendor, or an admin.
alter policy extras_read on service_extras
  using (active or is_vendor_staff(vendor_id) or is_admin());
alter policy extras_admin_write on service_extras
  using (is_vendor_manager(vendor_id) or is_platform_admin())
  with check (is_vendor_manager(vendor_id) or is_platform_admin());
