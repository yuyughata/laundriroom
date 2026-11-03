-- ═══════════════════════════════════════════════════════════════════════════
-- 0034 — Partner Agreement with admin-editable clauses.
--
-- The agreement vendors accept (at /apply and Vendor → Verification) used to
-- be one fixed non-circumvention clause in code. It's now the "Partner
-- Agreement": an ordered list of clauses admins manage at Admin → Partner
-- agreement. The existing non-circumvention text is seeded as clause 1.
--
-- platform_settings.agreement_updated_at moves whenever a clause changes,
-- so a vendor who accepted an older version is asked to accept again
-- (vendors.terms_accepted_at < agreement_updated_at).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists agreement_clauses (
  id         uuid primary key default gen_random_uuid(),
  position   int not null default 0,
  title      text not null,
  body       text not null,                       -- paragraphs separated by a blank line
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agreement_clauses_title_nonempty check (length(btrim(title)) > 0),
  constraint agreement_clauses_body_nonempty check (length(btrim(body)) > 0)
);
create index if not exists agreement_clauses_position_idx on agreement_clauses (position);
comment on table agreement_clauses is 'Partner Agreement clauses shown to vendors; managed by platform admins.';

alter table platform_settings add column if not exists agreement_updated_at timestamptz not null default now();

drop trigger if exists agreement_clauses_updated_at on agreement_clauses;
create trigger agreement_clauses_updated_at before update on agreement_clauses
  for each row execute function set_updated_at();

create or replace function touch_agreement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update platform_settings set agreement_updated_at = now() where id;
  return null;
end;
$$;
drop trigger if exists agreement_clauses_touch on agreement_clauses;
create trigger agreement_clauses_touch after insert or update or delete on agreement_clauses
  for each statement execute function touch_agreement();
revoke execute on function touch_agreement() from public, anon, authenticated;

alter table agreement_clauses enable row level security;
drop policy if exists agreement_read on agreement_clauses;
create policy agreement_read on agreement_clauses for select
  using (active or is_platform_admin());
drop policy if exists agreement_admin_write on agreement_clauses;
create policy agreement_admin_write on agreement_clauses for all
  using (is_platform_admin()) with check (is_platform_admin());
grant select on agreement_clauses to anon, authenticated;

-- Seed with the existing non-circumvention clause (once). Seeding must not
-- invalidate acceptances already given, so keep agreement_updated_at at the
-- time of the earliest existing acceptance.
do $$
begin
  if not exists (select 1 from agreement_clauses) then
    insert into agreement_clauses (position, title, body) values (1, 'Non-circumvention',
      'Customers introduced to you through laundriroom are platform customers. For twelve (12) months from a customer’s first order placed with you via laundriroom, you agree to transact all laundry services for that customer through the laundriroom platform.'
      || E'\n\n' ||
      'You will not solicit, divert, or accept such customers’ orders, payments, or contact outside the platform — directly or indirectly, and whether in cash or otherwise — during that period.'
      || E'\n\n' ||
      'Breach may result in withheld or reversed payouts, commission adjustments to recover lost platform fees, suspension, de-listing, and recovery of damages. This obligation survives termination for the period stated and is enforceable against the verified business and its principals named in your ID and CAC records.');
    update platform_settings
       set agreement_updated_at = coalesce(
             (select least(min(terms_accepted_at), now()) from vendors where terms_accepted_at is not null),
             now() - interval '1 second')
     where id;
  end if;
end $$;
