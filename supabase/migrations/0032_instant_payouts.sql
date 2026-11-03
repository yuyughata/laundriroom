-- ═══════════════════════════════════════════════════════════════════════════
-- 0032 — Pay vendors as soon as an order is reconciled.
--
-- Before: a payout fell due 24 hours after the order was completed and paid,
-- and the hourly job sent it.
-- Now:
--   1. platform_settings.payout_delay_hours (default 0) — an optional hold
--      window an admin can set on Fees & charges. 0 = pay immediately.
--   2. schedule_payout_if_ready makes the payout due at
--      max(now, completed_at + delay) — i.e. right away by default.
--   3. When a payout is created already due, the database calls the
--      process-payouts function for that payout straight away (pg_net, after
--      the transaction commits). The hourly job (0019) stays as the safety
--      net for retries and for any hold window.
--   request_payout_run() reads the same two Vault secrets as the hourly job
--   and does nothing where they aren't set (e.g. local dev).
-- ═══════════════════════════════════════════════════════════════════════════

alter table platform_settings
  add column if not exists payout_delay_hours int not null default 0;
alter table platform_settings drop constraint if exists payout_delay_hours_range;
alter table platform_settings add constraint payout_delay_hours_range
  check (payout_delay_hours between 0 and 720);
comment on column platform_settings.payout_delay_hours is
  'Hours to hold a vendor payout after the order is completed and paid. 0 = pay immediately.';

-- Same as 0022, except for when the payout falls due.
create or replace function schedule_payout_if_ready(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; paid boolean; rate numeric(5,4); fee numeric(12,2) := 0;
  vendor_gross numeric(12,2); delay int := 0;
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

  -- Commission is global: the default plan's rate applies to every vendor.
  select coalesce((select vp.commission_rate from vendor_plans vp where vp.is_default and vp.active limit 1), 0)
    into rate;
  fee := round(vendor_gross * coalesce(rate, 0), 2);

  select coalesce((select payout_delay_hours from platform_settings where id), 0) into delay;

  insert into payouts (vendor_id, order_ids, gross, fee, net, due_at, status)
  values (
    o.vendor_id, array[p_order], vendor_gross, fee, vendor_gross - fee,
    greatest(now(), coalesce(o.completed_at, now()) + make_interval(hours => delay)),
    'due'
  );
end;
$$;

-- Ask the process-payouts function to run now — for one payout, or (null)
-- for everything that's due. Fire-and-forget: pg_net sends it after commit.
create or replace function request_payout_run(p_payout uuid default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  base text;
  secret text;
  req bigint;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'process_payouts_cron_secret';
  if base is null or secret is null then return null; end if;

  select net.http_post(
    url     := base || '/functions/v1/process-payouts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := case when p_payout is null then '{}'::jsonb
                    else jsonb_build_object('payout_id', p_payout) end
  ) into req;
  return req;
end;
$$;

create or replace function pay_payout_when_due() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'due' and new.due_at <= now() then
    perform request_payout_run(new.id);
  end if;
  return new;
end;
$$;

create or replace trigger payouts_pay_when_due after insert on payouts
  for each row execute function pay_payout_when_due();

revoke execute on function schedule_payout_if_ready(uuid), request_payout_run(uuid), pay_payout_when_due()
  from public, anon, authenticated;
