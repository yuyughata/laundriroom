-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — Security lockdown (found by the Supabase security advisor + probes)
--
-- 1. Sign-up no longer trusts a `role` in user metadata. Anyone holding the
--    public anon key could call auth.signUp with role=platform_admin and get it.
--    Every new account is a customer; admins promote staff afterwards.
-- 2. Users can't change their own role/status/verification flags. The
--    profiles_self_update policy allowed any column, so a customer could make
--    themselves platform_admin from the browser.
-- 3. Views run with their owner's rights and bypass RLS, and anon could read
--    them. order_summaries now filters rows like orders_read (customers saw
--    every customer's orders on their home page); the other three views
--    respect the callers' RLS; none are readable signed-out.
-- 4. Internal and trigger-only functions can't be called through the REST API,
--    and nothing is callable signed-out.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Sign-up always creates a customer ──────────────────────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  referrer uuid;
begin
  if (new.raw_user_meta_data ? 'ref') and length(coalesce(new.raw_user_meta_data->>'ref', '')) > 0 then
    select id into referrer from profiles where referral_code = upper(new.raw_user_meta_data->>'ref');
  end if;

  insert into profiles (id, full_name, email, phone, role, email_verified, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    'customer',                       -- never from metadata: the client controls it
    new.email_confirmed_at is not null,
    'LR' || upper(substr(md5(new.id::text), 1, 6)),
    referrer
  )
  on conflict (id) do nothing;

  if referrer is not null then
    insert into referrals (referrer_id, referee_id, status)
      values (referrer, new.id, 'pending')
      on conflict (referee_id) do nothing;
  end if;
  return new;
end;
$$;

-- ─── 2. Protect privileged profile columns ─────────────────────────────────
-- Runs as the caller. API users (anon/authenticated) may only change these
-- columns when they're a platform admin; database-side code (triggers, edge
-- functions on the service role, the SQL editor) is unaffected.
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
    then
      raise exception 'not allowed to change these profile fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_columns on profiles;
create trigger profiles_guard_columns before update on profiles
  for each row execute function guard_profile_columns();

-- ─── 3. Views ──────────────────────────────────────────────────────────────
-- order_summaries keeps owner rights so vendor staff still get the customer's
-- name (they can't read profiles directly), but only returns the rows the
-- caller could read from orders.
create or replace view order_summaries as
select
  o.id,
  o.code,
  o.status,
  o.entry_mode,
  o.return_mode,
  o.payment_timing,
  o.service_tier,
  o.turnaround,
  o.total,
  o.delivery_fee,
  o.created_at,
  o.ready_at,
  o.closed_at,
  o.vendor_id,
  v.name as vendor_name,
  o.customer_id,
  p.full_name as customer_name,
  (select count(*) from order_items oi where oi.order_id = o.id) as item_count,
  exists (select 1 from payments pm where pm.order_id = o.id and pm.status = 'succeeded') as is_paid
from orders o
join vendors v on v.id = o.vendor_id
join profiles p on p.id = o.customer_id
where o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_admin();

-- These only need what the caller's RLS already allows:
--   user_directory       → admins read all profiles/memberships/vendors
--   vendor_daily_takings → ledger_read (vendor staff, admins)
--   vendor_ratings       → reviews_read (any signed-in user)
alter view user_directory       set (security_invoker = true);
alter view vendor_daily_takings set (security_invoker = true);
alter view vendor_ratings       set (security_invoker = true);

revoke all on order_summaries, user_directory, vendor_daily_takings, vendor_ratings from anon;

-- ─── 4. Function execute rights ────────────────────────────────────────────
-- Trigger functions: never called directly (triggers don't need EXECUTE).
revoke execute on function
  apply_stage_event(), assign_item_subcode(), assign_order_code(), bind_tag_on_item(),
  handle_new_user(), on_order_closed(), on_payment_succeeded(), recompute_order_totals(),
  sync_email_verified(), touch_ticket_on_message(), trg_referral_reward(), set_updated_at(),
  guard_profile_columns()
from public, anon, authenticated;

-- Internal helpers: only called from other database functions.
revoke execute on function
  recompute_order(uuid), schedule_payout_if_ready(uuid), reward_referral_if_eligible(uuid)
from public, anon, authenticated;

-- App RPCs: signed-in only (each checks the caller's role itself).
revoke execute on function
  get_platform_metrics(), get_analytics(), get_leakage_analytics(),
  confirm_pickup(uuid, text), apply_delivery_reschedule(uuid, boolean), redeem_promo(text, uuid)
from public, anon;
grant execute on function
  get_platform_metrics(), get_analytics(), get_leakage_analytics(),
  confirm_pickup(uuid, text), apply_delivery_reschedule(uuid, boolean), redeem_promo(text, uuid)
to authenticated;

-- Pin search_path (advisor: function_search_path_mutable).
alter function set_updated_at() set search_path = public;
