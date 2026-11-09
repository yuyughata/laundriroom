-- ═══════════════════════════════════════════════════════════════════════════
-- 0046  Payment before handover · real tags at check-in · provider keys in
--       Vault · cron secret check · admin vendor delete
--
-- 1. Handover needs payment. confirm_handover(order, code) is the only way to
--    close an order with the customer's delivery code: it refuses until a
--    payment has succeeded (PAYMENT_PENDING), then checks the code
--    (WRONG_CODE). A payment no longer closes a pay-on-delivery order by
--    itself; the order stays Ready / Out for delivery until the code is
--    confirmed. API users can't insert a 'handover' stage directly.
-- 2. Check-in only takes this laundry's generated tags (check_item_tag): the
--    code must exist in tags for the order's vendor and be free (or already on
--    this item) — not missing, damaged, retired or on another item. Codes are
--    upper-cased; a bare number becomes the vendor's PREFIX-NNNN.
-- 3. Admin → Integrations keys (Resend, WhatsApp, SMS) are stored in Supabase
--    Vault by set_integration_secret() (platform admins) and read by the edge
--    functions with integration_secret() (service role only).
-- 4. cron_secret_ok(): process-payouts checks the hourly job's secret against
--    the Vault copy, so no separate CRON_SECRET function secret is needed.
-- 5. admin_delete_vendor(): platform admins delete a vendor that has no
--    orders (staff accounts go back to customer). Vendors with orders are
--    refused (HAS_ORDERS) — suspend them instead, so money history stays.
-- Drop-free; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Payment first, then the delivery code ───────────────────────────────
create or replace function order_is_paid(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payments where order_id = p_order and status = 'succeeded');
$$;
revoke execute on function order_is_paid(uuid) from public, anon;
grant execute on function order_is_paid(uuid) to authenticated;

-- Paying no longer closes the order; it only schedules the payout if the
-- order is already closed.
create or replace function on_payment_succeeded() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'succeeded' then
    perform schedule_payout_if_ready(new.order_id);
  end if;
  return new;
end;
$$;

-- Staff close orders only through confirm_handover().
create or replace function guard_stage_event() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.stage = 'handover' and current_user in ('anon', 'authenticated') then
    raise exception 'Close an order with the customer''s delivery code (confirm_handover).' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function guard_stage_event() from public, anon, authenticated;
create or replace trigger stage_events_guard before insert on stage_events
  for each row execute function guard_stage_event();

create or replace function confirm_handover(p_order uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'order not found'; end if;
  if not (is_admin() or can_staff_branch(o.vendor_id, o.branch_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if o.status not in ('ready', 'out_for_delivery', 'awaiting_collection') then
    raise exception 'NOT_READY';
  end if;
  if not order_is_paid(p_order) then
    raise exception 'PAYMENT_PENDING: ₦%', to_char(o.total, 'FM999,999,990');
  end if;
  if o.handover_code is null or btrim(coalesce(p_code, '')) <> o.handover_code then
    raise exception 'WRONG_CODE';
  end if;
  insert into stage_events (order_id, stage, pressed_by) values (p_order, 'handover', auth.uid());
end;
$$;
revoke execute on function confirm_handover(uuid, text) from public, anon;
grant execute on function confirm_handover(uuid, text) to authenticated;

-- ─── 2. Only generated, free tags at check-in ───────────────────────────────
create or replace function check_item_tag() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid; t tags%rowtype; pfx text; other text;
begin
  if new.tag_code is null or btrim(new.tag_code) = '' then
    new.tag_code := null;
    return new;
  end if;
  new.tag_code := upper(btrim(new.tag_code));
  if tg_op = 'UPDATE' and new.tag_code is not distinct from old.tag_code then return new; end if;

  select vendor_id into v from orders where id = new.order_id;
  if new.tag_code ~ '^[0-9]+$' then
    select tag_prefix into pfx from vendors where id = v;
    if pfx is not null then
      new.tag_code := pfx || '-' || lpad(coalesce(nullif(ltrim(new.tag_code, '0'), ''), '0'), 4, '0');
    end if;
  end if;

  select * into t from tags where code = new.tag_code;
  if t.id is null or t.vendor_id is distinct from v then
    raise exception 'TAG_UNKNOWN: %', new.tag_code;
  end if;
  if t.status::text in ('missing', 'damaged', 'retired') then
    raise exception 'TAG_UNAVAILABLE: %', t.status;
  end if;
  if t.status::text = 'in_use' and t.current_item_id is distinct from new.id then
    select o.code into other from order_items i join orders o on o.id = i.order_id where i.id = t.current_item_id;
    raise exception 'TAG_IN_USE: %', coalesce(other, 'another order');
  end if;
  return new;
end;
$$;
revoke execute on function check_item_tag() from public, anon, authenticated;
create or replace trigger order_items_check_tag before insert or update of tag_code on order_items
  for each row execute function check_item_tag();

-- ─── 3. Provider keys in Vault ──────────────────────────────────────────────
alter table integration_settings add column if not exists last_error text;

create or replace function set_integration_secret(p_provider text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
declare nm text := 'integration_' || p_provider; sid uuid;
begin
  if not is_platform_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_provider not in ('resend', 'whatsapp', 'sms') then raise exception 'unknown provider'; end if;
  select id into sid from vault.secrets where name = nm;
  if p_secret is null or btrim(p_secret) = '' then
    -- Disconnect: blank the stored value (an empty key counts as no key).
    if sid is not null then perform vault.update_secret(sid, ''); end if;
    return;
  end if;
  if sid is null then
    perform vault.create_secret(btrim(p_secret), nm, 'laundriroom ' || p_provider || ' key (Admin → Integrations)');
  else
    perform vault.update_secret(sid, btrim(p_secret));
  end if;
end;
$$;
revoke execute on function set_integration_secret(text, text) from public, anon;
grant execute on function set_integration_secret(text, text) to authenticated;

create or replace function integration_secret(p_provider text) returns text
language sql stable security definer set search_path = public as $$
  select nullif(decrypted_secret, '') from vault.decrypted_secrets where name = 'integration_' || p_provider limit 1;
$$;
revoke execute on function integration_secret(text) from public, anon, authenticated;
grant execute on function integration_secret(text) to service_role;

-- ─── 4. Cron secret check for process-payouts ───────────────────────────────
create or replace function cron_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'process_payouts_cron_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function cron_secret_ok(text) from public, anon, authenticated;
grant execute on function cron_secret_ok(text) to service_role;

-- ─── 5. Admin: delete a vendor with no orders ───────────────────────────────
create or replace function admin_delete_vendor(p_vendor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; v vendors%rowtype;
begin
  if not is_platform_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v from vendors where id = p_vendor;
  if v.id is null then raise exception 'vendor not found'; end if;
  select count(*) into n from orders where vendor_id = p_vendor;
  if n > 0 then raise exception 'HAS_ORDERS: %', n; end if;

  -- Staff accounts stay, as customers (unless they also work elsewhere).
  update profiles p set role = 'customer'
   where p.id in (select profile_id from vendor_memberships where vendor_id = p_vendor)
     and p.role in ('vendor_manager', 'attendant', 'rider')
     and not exists (select 1 from vendor_memberships m where m.profile_id = p.id and m.vendor_id <> p_vendor);
  delete from tags where vendor_id = p_vendor;
  update vendor_applications set vendor_id = null where vendor_id = p_vendor;
  delete from vendors where id = p_vendor;   -- the rest cascades
  insert into audit_log (actor_id, action, entity, entity_id, before)
  values (auth.uid(), 'vendor.delete', 'vendor', p_vendor::text, jsonb_build_object('name', v.name, 'slug', v.slug));
end;
$$;
revoke execute on function admin_delete_vendor(uuid) from public, anon;
grant execute on function admin_delete_vendor(uuid) to authenticated;
