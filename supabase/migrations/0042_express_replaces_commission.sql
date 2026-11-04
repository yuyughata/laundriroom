-- ============================================================================
-- 0042  Express replaces the commission
-- ----------------------------------------------------------------------------
--  The commission is charged on the normal turnaround. When the customer picks
--  express, the express charge takes its place — no commission is added.
--  Premium still applies on top in both cases. All % of the vendor's price:
--
--    ₦200 item, commission 30%, express 20%, premium 12.5%
--      normal  + standard  200 + 60           = 260
--      normal  + premium   200 + 60      + 25 = 285
--      express + standard  200      + 40      = 240
--      express + premium   200      + 40 + 25 = 265
--    The vendor receives ₦200 in every case.
--
--  orders.commission_markup is now the rate actually added to item prices:
--  the global commission on a normal order, 0 on an express order. If an
--  order's turnaround is changed, the rate and its items' prices follow.
--  Orders placed before 0041 (NULL) are untouched.
-- ============================================================================

create or replace function set_order_commission_markup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.commission_markup := case when new.turnaround = 'express' then 0
                                  else current_commission_rate() end;
  elsif old.commission_markup is not null
        and new.turnaround is distinct from old.turnaround then
    new.commission_markup := case when new.turnaround = 'express' then 0
                                  else current_commission_rate() end;
  else
    new.commission_markup := old.commission_markup;
  end if;
  return new;
end;
$$;
revoke execute on function set_order_commission_markup() from public, anon, authenticated;

-- Turnaround changed → re-price the items (their BEFORE trigger reads the new
-- rate; their AFTER trigger recomputes the order).
create or replace function reprice_items_on_turnaround() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.commission_markup is not null
     and new.commission_markup is distinct from old.commission_markup then
    update order_items set customer_price = null where order_id = new.id;
    perform recompute_order(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function reprice_items_on_turnaround() from public, anon, authenticated;

create or replace trigger orders_reprice_on_turnaround
  after update of turnaround on orders
  for each row execute function reprice_items_on_turnaround();

-- Existing open express orders placed under 0041: drop the commission.
-- (The guard trigger keeps commission_markup fixed, so it's paused for this.)
alter table orders disable trigger orders_commission_markup;
update orders set commission_markup = 0
 where turnaround = 'express' and commission_markup is not null and commission_markup <> 0
   and status not in ('closed', 'cancelled');
alter table orders enable trigger orders_commission_markup;
update order_items oi set customer_price = null
  from orders o
 where o.id = oi.order_id and o.turnaround = 'express'
   and o.commission_markup = 0 and oi.customer_price is distinct from oi.price_at_checkin;
