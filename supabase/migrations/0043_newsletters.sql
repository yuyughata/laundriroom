-- ═══════════════════════════════════════════════════════════════════════════
-- 0043  Newsletters
--   • newsletters: one email campaign — subject, preheader, header image,
--     rich-text body (sanitised HTML), a call-to-action button, footer image,
--     and who it goes to (groups and/or chosen people). Platform admins only.
--   • newsletter_recipients: who it was sent to, and whether each send worked.
--   • newsletter-images: a public bucket for header/footer images (email
--     clients need a public link; signed links expire).
--   • profiles.newsletter_opt_out + unsubscribe_token: every newsletter carries
--     a one-click unsubscribe link; opted-out people are never included.
--   • newsletter_audience(): resolves an audience to active people with an
--     email who haven't opted out.
--
-- Written without DROP statements so it can be applied to the live project
-- as-is and re-run safely.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Opt-out and unsubscribe link ────────────────────────────────────────
alter table profiles add column if not exists newsletter_opt_out boolean not null default false;
alter table profiles add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_unsubscribe_token_key on profiles (unsubscribe_token);
comment on column profiles.newsletter_opt_out is 'True = this person doesn''t want newsletters (set from the email''s unsubscribe link or their account).';
comment on column profiles.unsubscribe_token is 'Secret in each newsletter''s unsubscribe link. Only the system changes it.';

-- Same rules as 0018, plus: nobody but an admin changes their unsubscribe token.
-- Runs as the caller (no SECURITY DEFINER), like 0018: current_user must be the
-- API role for the check to apply.
create or replace function guard_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not is_platform_admin() then
    if new.id                    is distinct from old.id
    or new.role                  is distinct from old.role
    or new.status                is distinct from old.status
    or new.email                 is distinct from old.email
    or new.email_verified        is distinct from old.email_verified
    or new.verify_reminders_sent is distinct from old.verify_reminders_sent
    or new.referral_code         is distinct from old.referral_code
    or new.referred_by           is distinct from old.referred_by
    or new.unsubscribe_token     is distinct from old.unsubscribe_token
    then
      raise exception 'not allowed to change these profile fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- One-click unsubscribe from the email link (works signed out).
create or replace function unsubscribe_newsletter(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  update profiles set newsletter_opt_out = true
   where unsubscribe_token = p_token
   returning coalesce(nullif(split_part(btrim(full_name), ' ', 1), ''), 'there') into who;
  return who;                                            -- null = unknown link
end;
$$;
revoke execute on function unsubscribe_newsletter(uuid) from public;
grant execute on function unsubscribe_newsletter(uuid) to anon, authenticated;

-- ─── 2. Newsletters ─────────────────────────────────────────────────────────
create table if not exists newsletters (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null default '',
  preheader        text,
  header_image_url text,
  footer_image_url text,
  body_html        text not null default '',
  cta_label        text,
  cta_url          text,
  -- {"groups": ["customers" | "vendor_managers" | "vendor_staff" | "team" | "everyone"], "user_ids": [uuid…]}
  audience         jsonb not null default '{"groups": ["customers"], "user_ids": []}'::jsonb,
  status           text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  recipient_count  int not null default 0,
  sent_count       int not null default 0,
  failed_count     int not null default 0,
  last_error       text,
  last_test_at     timestamptz,
  sent_at          timestamptz,
  created_by       uuid default auth.uid() references profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists newsletters_created_idx on newsletters (created_at desc);

create table if not exists newsletter_recipients (
  newsletter_id uuid not null references newsletters (id) on delete cascade,
  email         text not null,
  profile_id    uuid references profiles (id) on delete set null,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error         text,
  sent_at       timestamptz,
  primary key (newsletter_id, email)
);

alter table newsletters enable row level security;
alter table newsletter_recipients enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'newsletters' and policyname = 'newsletters_admin_all') then
    create policy newsletters_admin_all on newsletters for all
      using (is_platform_admin()) with check (is_platform_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'newsletter_recipients' and policyname = 'newsletter_recipients_admin_read') then
    create policy newsletter_recipients_admin_read on newsletter_recipients for select using (is_platform_admin());
  end if;
end $$;

-- A sent newsletter is a record: only its counts/status move after sending.
-- Runs as the caller, so current_user is the API role.
create or replace function guard_newsletter() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if current_user in ('anon', 'authenticated') then
    if old.status <> 'draft' and (
         new.subject is distinct from old.subject or new.body_html is distinct from old.body_html
      or new.header_image_url is distinct from old.header_image_url or new.footer_image_url is distinct from old.footer_image_url
      or new.cta_label is distinct from old.cta_label or new.cta_url is distinct from old.cta_url
      or new.audience is distinct from old.audience or new.preheader is distinct from old.preheader) then
      raise exception 'This newsletter has been sent and can''t be edited. Duplicate it instead.' using errcode = '42501';
    end if;
    -- sending state and counts are set by the sender (service key) only
    if new.status is distinct from old.status or new.sent_count is distinct from old.sent_count
       or new.failed_count is distinct from old.failed_count or new.recipient_count is distinct from old.recipient_count
       or new.sent_at is distinct from old.sent_at then
      raise exception 'not allowed to change the sending status' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function guard_newsletter() from public, anon, authenticated;
create or replace trigger newsletters_guard before update on newsletters
  for each row execute function guard_newsletter();

-- ─── 3. Who a newsletter goes to ────────────────────────────────────────────
-- Active accounts with an email that haven't opted out, from the chosen groups
-- plus any chosen people. Platform admins (to count) and the sender only.
create or replace function newsletter_audience(p_audience jsonb)
returns table (profile_id uuid, email text, full_name text, unsubscribe_token uuid)
language plpgsql stable security definer set search_path = public as $$
declare g text[]; ids uuid[]; jwt_role text;
begin
  -- Inside SECURITY DEFINER current_user is the owner, so ask the request's
  -- JWT who is calling: the sender uses the service key; direct database
  -- sessions (no JWT, not via the API) are trusted too.
  jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
  if not (jwt_role = 'service_role' or (jwt_role = '' and session_user <> 'authenticator') or is_platform_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  g := array(select jsonb_array_elements_text(coalesce(p_audience -> 'groups', '[]'::jsonb)));
  ids := array(select (x)::uuid from jsonb_array_elements_text(coalesce(p_audience -> 'user_ids', '[]'::jsonb)) x);
  return query
    select distinct on (lower(p.email)) p.id, p.email::text, p.full_name, p.unsubscribe_token
      from profiles p
     where p.status = 'active'
       and p.email is not null and btrim(p.email::text) <> ''
       and not p.newsletter_opt_out
       and (
            'everyone' = any (g)
         or ('customers' = any (g)       and p.role = 'customer')
         or ('vendor_managers' = any (g) and p.role = 'vendor_manager')
         or ('vendor_staff' = any (g)    and p.role in ('vendor_manager', 'attendant', 'rider'))
         or ('team' = any (g)            and p.role in ('platform_admin', 'support_agent'))
         or p.id = any (ids)
       )
     order by lower(p.email), p.created_at;
end;
$$;
revoke execute on function newsletter_audience(jsonb) from public, anon;
grant execute on function newsletter_audience(jsonb) to authenticated;

-- ─── 4. Header / footer images ──────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('newsletter-images', 'newsletter-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'newsletter images upload') then
    create policy "newsletter images upload" on storage.objects for insert
      with check (bucket_id = 'newsletter-images' and is_platform_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'newsletter images manage') then
    create policy "newsletter images manage" on storage.objects for delete
      using (bucket_id = 'newsletter-images' and is_platform_admin());
  end if;
end $$;
