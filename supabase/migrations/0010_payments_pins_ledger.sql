-- ============================================================================
-- 0010  Payment provider, handover PINs (pickup + delivery), ledger receipts
-- ============================================================================

-- ─── Payment provider choice (Paystack or Flutterwave) ──────────────────────
alter table platform_settings add column payment_provider text not null default 'paystack'
  check (payment_provider in ('paystack', 'flutterwave'));

-- ─── One-time PINs: pickup (rider collects) and handover (delivery/collection)
alter table orders add column pickup_code text;        -- confirm collection from the customer
alter table orders add column picked_up_at timestamptz;
-- handover_code already exists; we now generate it for every order, not only prepaid.

-- ─── Ledger receipts (bookkeeping) ──────────────────────────────────────────
alter table ledger_entries add column receipt_path text;   -- storage path for an uploaded receipt

-- Receipts bucket (private; vendor staff of the vendor read/write).
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts rw" on storage.objects for all
  using (
    bucket_id = 'receipts' and (
      is_platform_admin() or is_vendor_staff((split_part(name, '/', 1))::uuid)
    )
  )
  with check (
    bucket_id = 'receipts' and (
      is_platform_admin() or is_vendor_staff((split_part(name, '/', 1))::uuid)
    )
  );

-- ─── Regenerate order codes: handover for all orders, pickup PIN for pickups ─
create or replace function assign_order_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Africa/Lagos')::date;
  seq int;
begin
  if new.code is null or new.code = '' then
    insert into order_daily_counter (day, last_seq) values (d, 1)
      on conflict (day) do update set last_seq = order_daily_counter.last_seq + 1
      returning last_seq into seq;
    new.code := 'ORD-' || to_char(d, 'YYMMDD') || '-' || lpad(seq::text, 4, '0');
  end if;

  -- handover PIN for the return leg (delivery or collection) — every order
  if new.handover_code is null then
    new.handover_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  end if;

  -- pickup PIN when a rider collects from the customer
  if new.entry_mode = 'pickup' and new.pickup_code is null then
    new.pickup_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  end if;

  return new;
end;
$$;

-- ─── Confirm pickup with the PIN (rider/attendant) ──────────────────────────
create or replace function confirm_pickup(p_order uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'order not found'; end if;
  if not (is_vendor_staff(o.vendor_id) or is_admin()) then raise exception 'not authorized'; end if;
  if o.entry_mode <> 'pickup' then raise exception 'not a pickup order'; end if;
  if o.pickup_code is distinct from p_code then raise exception 'pin does not match'; end if;

  update orders set picked_up_at = coalesce(picked_up_at, now()) where id = p_order;
end;
$$;
