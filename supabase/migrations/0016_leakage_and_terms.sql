-- ============================================================================
-- 0016  Leakage analytics  +  non-circumvention agreement
-- ----------------------------------------------------------------------------
--  • get_leakage_analytics(): per-vendor disintermediation signals so admins can
--    spot vendors whose customers order once and vanish, or who engaged and then
--    went quiet (the classic "moved off-platform" pattern).
--  • Vendor agreement: record that a vendor accepted the non-circumvention terms,
--    at application time and again when they acknowledge in-app (tied to KYC).
-- ============================================================================

-- ─── Agreement tracking ─────────────────────────────────────────────────────
alter table vendor_applications add column agreed_terms boolean not null default false;
alter table vendor_applications add column agreed_at    timestamptz;
alter table vendors             add column terms_accepted_at timestamptz;

-- ─── Leakage analytics (admin-only) ─────────────────────────────────────────
-- A customer "belongs" to a vendor once they have a closed order with them.
--   one_and_done  : exactly one closed order with the vendor
--   repeat        : two or more closed orders with the vendor
--   lapsed_repeat : repeat customers whose last order was > 45 days ago
--                   (engaged, then went quiet — the strongest leakage signal)
create or replace function get_leakage_analytics() returns json
language plpgsql stable security definer set search_path = public as $$
declare lapse_days int := 45;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  return (
  with co as (
    select customer_id, vendor_id, count(*) n,
           max(coalesce(closed_at, created_at)) last_at
    from orders where status = 'closed'
    group by customer_id, vendor_id
  ),
  per_vendor as (
    select v.id as vendor_id, v.name as vendor_name,
      count(*)                                                                  as customers,
      coalesce(sum(co.n), 0)                                                    as orders,
      count(*) filter (where co.n = 1)                                          as one_and_done,
      count(*) filter (where co.n >= 2)                                         as repeat_customers,
      count(*) filter (where co.n >= 2 and co.last_at < now() - make_interval(days => lapse_days)) as lapsed_repeat,
      count(*) filter (where co.last_at < now() - make_interval(days => lapse_days)) as dormant_customers
    from vendors v
    left join co on co.vendor_id = v.id
    group by v.id, v.name
    having count(co.customer_id) > 0
  )
  select json_build_object(
    'lapse_days', lapse_days,
    'totals', (
      select json_build_object(
        'customers',        coalesce(sum(customers), 0),
        'one_and_done',     coalesce(sum(one_and_done), 0),
        'one_and_done_pct', case when coalesce(sum(customers),0) = 0 then 0
                              else round(100.0 * sum(one_and_done) / sum(customers), 1) end,
        'lapsed_repeat',    coalesce(sum(lapsed_repeat), 0)
      ) from per_vendor
    ),
    'vendors', (
      select coalesce(json_agg(row_to_json(x) order by x.one_and_done_pct desc, x.lapsed_repeat desc), '[]')
      from (
        select vendor_id, vendor_name, customers, orders,
               one_and_done, repeat_customers, lapsed_repeat, dormant_customers,
               case when customers = 0 then 0
                    else round(100.0 * one_and_done / customers, 1) end as one_and_done_pct
        from per_vendor
      ) x
    )
  ));
end;
$$;
