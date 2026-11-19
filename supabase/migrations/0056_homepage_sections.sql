-- 0056 — custom homepage sections.
--
-- Beyond editing the built-in copy (0055), admins can add their own content
-- sections to the landing page — and duplicate an existing one as a starting
-- point. Each row renders as a band (eyebrow + heading + body + optional
-- button), light or dark, in position order, just above the final call to
-- action. Hidden/!active rows don't render.

create table if not exists homepage_sections (
  id         uuid primary key default gen_random_uuid(),
  position   int  not null default 0,
  eyebrow    text,
  heading    text not null default 'New section',
  body       text,
  cta_label  text,
  cta_href   text,
  tone       text not null default 'light',   -- 'light' | 'dark'
  active     boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table homepage_sections enable row level security;

-- Public sees active sections (the homepage is public); admins see all to edit.
create policy homepage_sections_read on homepage_sections
  for select using (active or is_platform_admin());

create policy homepage_sections_write on homepage_sections
  for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

grant select on homepage_sections to anon, authenticated;
grant insert, update, delete on homepage_sections to authenticated;
