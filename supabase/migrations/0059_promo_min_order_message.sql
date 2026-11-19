-- 0059_promo_min_order_message.sql
--
-- Friendlier wording when a promo code is below its minimum order. The amount
-- stays dynamic (the code's own min_order). Only the message text changes from
-- 0054; the rest of redeem_promo is unchanged.

create or replace function public.redeem_promo(p_code text, p_order uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare pc promo_codes%rowtype; uid uuid := auth.uid(); n int; ov uuid; base numeric(12,2);
begin
  select * into pc from promo_codes where upper(code) = upper(p_code) and active;
  if not found then raise exception 'Invalid code'; end if;
  if pc.starts_at is not null and now() < pc.starts_at then raise exception 'Code is not active yet'; end if;
  if pc.expires_at is not null and now() > pc.expires_at then raise exception 'Code has expired'; end if;
  if pc.usage_limit is not null and pc.used_count >= pc.usage_limit then raise exception 'Code is fully used'; end if;
  if pc.owner_id is not null and pc.owner_id <> uid then raise exception 'Code is not valid for this account'; end if;

  select vendor_id, coalesce(items_total, 0) + coalesce(extras_total, 0)
    into ov, base
    from orders where id = p_order and customer_id = uid;
  if ov is null then raise exception 'order not found'; end if;
  if pc.vendor_id is not null and pc.vendor_id <> ov then raise exception 'This code is not valid for this laundry'; end if;
  if exists (select 1 from orders where id = p_order and promo_code is not null) then raise exception 'A code is already applied'; end if;

  if coalesce(pc.min_order, 0) > 0 and base > 0 and base < pc.min_order then
    raise exception 'Oops! Spend ₦% or more to enjoy your discount. Keep your code handy for next time!', trim(to_char(pc.min_order, 'FM999G999G990'));
  end if;

  select count(*) into n from promo_redemptions where promo_id = pc.id and customer_id = uid;
  if n >= pc.per_customer_limit then raise exception 'You have already used this code'; end if;

  update promo_codes set used_count = used_count + 1 where id = pc.id;
  insert into promo_redemptions (promo_id, customer_id, order_id) values (pc.id, uid, p_order);
  update orders
    set promo_code = pc.code, discount_type = pc.discount_type,
        discount_value = pc.value, discount_max = pc.max_discount,
        discount_min_order = coalesce(pc.min_order, 0),
        discount_vendor_funded = (pc.vendor_id is not null)
    where id = p_order;
  perform recompute_order(p_order);

  return json_build_object('code', pc.code, 'discount_type', pc.discount_type, 'value', pc.value);
end;
$function$;
