-- ═══════════════════════════════════════════════════════════════════════════
-- 0064 — Mailing-list subscribers as an email-broadcast audience
--
-- Lets Admin → Emails send a broadcast to the homepage mailing-list sign-ups
-- (non-account contacts from 0063), alongside the account audience groups.
--   • mailing_list gains its own unsubscribe_token + unsubscribed_at, so every
--     email carries a working one-click unsubscribe link just like accounts.
--   • newsletter_audience() unions mailing-list subscribers in when the
--     "mailing_list" group is selected, de-duplicated by email (an account with
--     the same address wins, so no one is emailed twice; an account that opted
--     out is never emailed even if also on the list).
--   • unsubscribe_newsletter() also handles a mailing-list token.
-- ═══════════════════════════════════════════════════════════════════════════

alter table mailing_list add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
alter table mailing_list add column if not exists unsubscribed_at timestamptz;
create unique index if not exists mailing_list_unsubscribe_token_key on mailing_list (unsubscribe_token);

-- ─── Audience: accounts (as before) + mailing-list subscribers ──────────────
create or replace function newsletter_audience(p_audience jsonb)
returns table (profile_id uuid, email text, full_name text, unsubscribe_token uuid)
language plpgsql stable security definer set search_path = public as $$
declare g text[]; ids uuid[]; jwt_role text;
begin
  jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
  if not (jwt_role = 'service_role' or (jwt_role = '' and session_user <> 'authenticator') or is_platform_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  g := array(select jsonb_array_elements_text(coalesce(p_audience -> 'groups', '[]'::jsonb)));
  ids := array(select (x)::uuid from jsonb_array_elements_text(coalesce(p_audience -> 'user_ids', '[]'::jsonb)) x);
  return query
  with picks as (
    -- Account recipients (active, has email, not opted out), from the chosen
    -- groups plus any chosen people. pref 0 so an account wins de-dup.
    select p.id as pid, p.email::text as em, p.full_name as fn, p.unsubscribe_token as tok,
           0 as pref, p.created_at as cat
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
    union all
    -- Homepage mailing-list subscribers (non-account). pref 1. Skip any email
    -- that belongs to an account which opted out.
    select null::uuid, m.email::text, null::text, m.unsubscribe_token,
           1 as pref, m.created_at
      from mailing_list m
     where 'mailing_list' = any (g)
       and m.unsubscribed_at is null
       and m.email is not null and btrim(m.email) <> ''
       and not exists (
             select 1 from profiles pp
              where lower(pp.email) = lower(m.email) and pp.newsletter_opt_out
           )
  )
  select distinct on (lower(picks.em)) picks.pid, picks.em, picks.fn, picks.tok
    from picks
   order by lower(picks.em), picks.pref, picks.cat;
end;
$$;
revoke execute on function newsletter_audience(jsonb) from public, anon;
grant execute on function newsletter_audience(jsonb) to authenticated;

-- ─── One-click unsubscribe: accounts and mailing-list subscribers ───────────
create or replace function unsubscribe_newsletter(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  update profiles set newsletter_opt_out = true
   where unsubscribe_token = p_token
   returning coalesce(nullif(split_part(btrim(full_name), ' ', 1), ''), 'there') into who;
  if who is not null then return who; end if;
  -- Not an account token → try the mailing list (a repeat click still succeeds).
  update mailing_list set unsubscribed_at = coalesce(unsubscribed_at, now())
   where unsubscribe_token = p_token
   returning 'there' into who;
  return who;                                            -- null = unknown link
end;
$$;
revoke execute on function unsubscribe_newsletter(uuid) from public;
grant execute on function unsubscribe_newsletter(uuid) to anon, authenticated;
