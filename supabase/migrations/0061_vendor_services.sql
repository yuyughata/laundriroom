-- 0061_vendor_services.sql
--
-- Per-vendor service settings (Vendor → Items → Services). The three services
-- stay the system-wide type (service_type: wash_and_fold / dry_clean /
-- press_only); this lets each laundry choose which ones it offers and rename
-- the customer-facing label (e.g. "Wash & Iron"). No change to the order engine.
--
--   vendor_services(vendor_id, service)  enabled + optional custom label
--   No row for a (vendor, service) = offered, with the default label.

create table if not exists vendor_services (
  vendor_id  uuid not null references vendors(id) on delete cascade,
  service    service_type not null,
  enabled    boolean not null default true,
  label      text,
  updated_at timestamptz not null default now(),
  primary key (vendor_id, service),
  constraint vendor_services_label_len check (label is null or length(btrim(label)) between 1 and 40)
);

alter table vendor_services enable row level security;

-- Public read: customers see which services a laundry offers and their labels.
drop policy if exists vendor_services_read on vendor_services;
create policy vendor_services_read on vendor_services for select using (true);

-- Write: the vendor's business-wide manager, or a platform admin.
drop policy if exists vendor_services_write on vendor_services;
create policy vendor_services_write on vendor_services for all
  using (is_vendor_manager(vendor_id) or is_platform_admin())
  with check (is_vendor_manager(vendor_id) or is_platform_admin());

grant select on vendor_services to anon, authenticated;
grant insert, update, delete on vendor_services to authenticated;
