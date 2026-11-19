-- 0055 — editable homepage/landing content.
--
-- A small key/value store the landing page reads at render time. Each row
-- overrides one piece of copy (hero title, a pillar description, a CTA label,
-- …); anything without a row falls back to the default baked into the page, so
-- the homepage never breaks. Platform admins edit it at Admin → Homepage.

create table if not exists homepage_content (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table homepage_content enable row level security;

-- The homepage is public, so anyone (incl. signed-out visitors) may read it.
create policy homepage_content_read on homepage_content
  for select using (true);

-- Only platform admins may change it.
create policy homepage_content_write on homepage_content
  for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

grant select on homepage_content to anon, authenticated;
grant insert, update, delete on homepage_content to authenticated;
