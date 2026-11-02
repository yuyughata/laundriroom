-- ============================================================================
-- 0012  Vendor-initiated promos & funding in reconciliation
-- A promo can be created by the platform (admin) or by a vendor.
--   • Admin/platform promo (promo_codes.vendor_id IS NULL): platform-funded.
--     The vendor is paid in full; the platform bears the discount.
--   • Vendor promo (promo_codes.vendor_id set): vendor-funded. The discount is
--     deducted from the vendor's payout in reconciliation.
-- ============================================================================

alter table promo_codes add column vendor_id uuid references vendors (id) on delete cascade;
alter table orders add column discount_vendor_funded boolean not null default false;

-- ─── Redeem: scope vendor promos to the vendor, record who funds the discount ─
create or replace function redeem_promo(p_code text, p_order uuid) returns json
language plpgsql security definer set search_path = public as $$
declare pc promo_codes%rowtype; uid uuid := auth.uid(); n int; ov uuid;
begin
  select * into pc from promo_codes where upper(code) = upper(p_code) and active;
  if not found then raise exception 'Invalid code'; end if;
  if pc.starts_at is not null and now() < pc.starts_at then raise exception 'Code is not active yet'; end if;
  if pc.expires_at is not null and now() > pc.expires_at then raise exception 'Code has expired'; end if;
  if pc.usage_limit is not null and pc.used_count >= pc.usage_limit then raise exception 'Code is fully used'; end if;
  if pc.owner_id is not null and pc.owner_id <> uid then raise exception 'Code is not valid for this account'; end if;

  select vendor_id into ov from orders where id = p_order and customer_id = uid;
  if ov is null then raise exception 'order not found'; end if;
  if pc.vendor_id is not null and pc.vendor_id <> ov then raise exception 'This code is not valid for this laundry'; end if;
  if exists (select 1 from orders where id = p_order and promo_code is not null) then raise exception 'A code is already applied'; end if;

  select count(*) into n from promo_redemptions where promo_id = pc.id and customer_id = uid;
  if n >= pc.per_customer_limit then raise exception 'You have already used this code'; end if;

  update promo_codes set used_count = used_count + 1 where id = pc.id;
  insert into promo_redemptions (promo_id, customer_id, order_id) values (pc.id, uid, p_order);
  update orders
    set promo_code = pc.code, discount_type = pc.discount_type,
        discount_value = pc.value, discount_max = pc.max_discount,
        discount_vendor_funded = (pc.vendor_id is not null)
    where id = p_order;
  perform recompute_order(p_order);

  return json_build_object('code', pc.code, 'discount_type', pc.discount_type, 'value', pc.value);
end;
$$;

-- ─── Payout: deduct a vendor-funded discount from the vendor's entitled gross ─
create or replace function schedule_payout_if_ready(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; paid boolean; pl vendor_plans%rowtype; fee numeric(12,2) := 0;
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

  select vp.* into pl from vendors v join vendor_plans vp on vp.id = v.plan_id where v.id = o.vendor_id;
  if pl.type in ('commission', 'combined') then
    fee := round(vendor_gross * coalesce(pl.commission_rate, 0), 2);
  end if;

  insert into payouts (vendor_id, order_ids, gross, fee, net, due_at, status)
  values (
    o.vendor_id, array[p_order], vendor_gross, fee, vendor_gross - fee,
    coalesce(o.completed_at, now()) + interval '24 hours', 'due'
  );
end;
$$;

-- ─── RLS: vendor managers manage their own promos; staff can read them ───────
create policy promos_vendor_read on promo_codes for select
  using (vendor_id is not null and is_vendor_staff(vendor_id));
create policy promos_vendor_write on promo_codes for all
  using (vendor_id is not null and is_vendor_manager(vendor_id))
  with check (vendor_id is not null and is_vendor_manager(vendor_id));
