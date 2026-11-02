-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — Reviews must be for the vendor that did the order.
--
-- reviews_insert (0009) compared `o.vendor_id = vendor_id`. Inside the
-- EXISTS subquery the bare `vendor_id` resolved to the order's own column, so
-- the check was always true: a customer with any closed order could post a
-- review against any vendor. Qualify it with the reviews row instead.
-- ═══════════════════════════════════════════════════════════════════════════

alter policy reviews_insert on reviews
  with check (
    customer_id = (select auth.uid())
    and exists (
      select 1 from orders o
      where o.id = reviews.order_id
        and o.customer_id = (select auth.uid())
        and o.vendor_id = reviews.vendor_id
        and o.status = 'closed'
    )
  );
