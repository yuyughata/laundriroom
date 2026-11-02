-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 — Global commission, vendor column guard, account email plumbing.
--
-- Rates are one platform-wide set, edited on Admin → Fees & charges:
-- commission (stored on the default plan) and the express / premium markups
-- (platform_settings). Money flow is unchanged: markups stay with the
-- platform, commission comes off the vendor's items + extras + delivery.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Payouts use the one platform commission rate ──────────────────────
create or replace function schedule_payout_if_ready(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; paid boolean; rate numeric(5,4); fee numeric(12,2) := 0;
  vendor_gross numeric(12,2);
begin
  select * into o from orders where id = p_order;
  if o.status <> 'closed' then return; end if;
  select exists(select 1 from payments where order_id = p_order and status = 'succeeded') into paid;
  if not paid then return; end if;
  if exists (select 1 from payouts where p_order = any(order_ids)) then return; end if;

  -- Vendor is entitled to items + extras + delivery, less any discount the VENDOR
  -- funded (platform-funded discounts do not touch the payout).
  vendor_gross := o.items_total + o.extras_total + o.delivery_fee;
  if o.discount_vendor_funded then
    vendor_gross := greatest(vendor_gross - o.discount, 0);
  end if;

  -- Commission is global: the default plan's rate applies to every vendor
  -- (previously a vendor with no plan paid 0%).
  select coalesce((select vp.commission_rate from vendor_plans vp where vp.is_default and vp.active limit 1), 0)
    into rate;
  fee := round(vendor_gross * coalesce(rate, 0), 2);

  insert into payouts (vendor_id, order_ids, gross, fee, net, due_at, status)
  values (
    o.vendor_id, array[p_order], vendor_gross, fee, vendor_gross - fee,
    coalesce(o.completed_at, now()) + interval '24 hours', 'due'
  );
end;
$$;

-- ─── 2. Vendor managers can't change admin-controlled vendor columns ──────
-- vendors_manager_update lets a manager update their own vendor row; without
-- this guard they could also verify themselves or change their plan.
create or replace function guard_vendor_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not is_platform_admin() then
    if new.status                   is distinct from old.status
    or new.plan_id                  is distinct from old.plan_id
    or new.kyc_verified             is distinct from old.kyc_verified
    then
      raise exception 'only a platform admin can change these vendor settings' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger vendors_guard_columns before update on vendors
  for each row execute function guard_vendor_columns();

-- ─── 3. Keep profiles.email in step when a user changes their email ───────
create or replace function sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create or replace trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function sync_profile_email();

revoke execute on function guard_vendor_columns(), sync_profile_email() from public, anon, authenticated;

-- ─── 4. Rules for the account & security emails ───────────────────────────
insert into notification_rules (event, channels, fallback_order, recipients, enabled)
select e, '{email}'::notif_channel[], '{email}'::notif_channel[], '{user}'::text[], true
from unnest(array['password_changed', 'account_updated', 'account_suspended', 'account_reactivated']::notif_event[]) as e
where not exists (select 1 from notification_rules r where r.event = e);
