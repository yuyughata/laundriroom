-- ═══════════════════════════════════════════════════════════════════════════
-- 0063 — Mailing list capture (homepage)
--
-- A public "be the first to hear about promos" capture form on the marketing
-- homepage. Anyone (signed in or not) can subscribe; only platform admins can
-- read or manage the list. Email is required, phone optional; a repeat email
-- is a no-op (unique on lower(email)).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mailing_list (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  phone      text,
  source     text not null default 'homepage',
  created_at timestamptz not null default now()
);

create unique index if not exists mailing_list_email_key
  on mailing_list (lower(email));

alter table mailing_list enable row level security;

-- Anyone can subscribe (public capture form).
drop policy if exists mailing_list_insert on mailing_list;
create policy mailing_list_insert on mailing_list
  for insert to anon, authenticated with check (true);

-- Only platform admins can read / manage the list.
drop policy if exists mailing_list_admin_read on mailing_list;
create policy mailing_list_admin_read on mailing_list
  for select using (is_platform_admin());

drop policy if exists mailing_list_admin_write on mailing_list;
create policy mailing_list_admin_write on mailing_list
  for all using (is_platform_admin()) with check (is_platform_admin());

grant insert on mailing_list to anon, authenticated;
grant select, update, delete on mailing_list to authenticated;
