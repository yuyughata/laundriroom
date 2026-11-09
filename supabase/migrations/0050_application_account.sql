-- 0050_application_account.sql
--
-- Partner applicants now set a password and get an account the moment they
-- apply, so they can sign in and check their status while we review (and keep
-- the same login once approved). Link the application to that account and let
-- the applicant read their own application.

alter table vendor_applications
  add column if not exists applicant_id uuid references profiles (id);

create index if not exists vendor_applications_applicant_idx
  on vendor_applications (applicant_id);

-- The applicant may read their own application (status page). Admins keep the
-- full read via applications_admin_read.
drop policy if exists applications_owner_read on vendor_applications;
create policy applications_owner_read on vendor_applications
  for select using (applicant_id = auth.uid());
