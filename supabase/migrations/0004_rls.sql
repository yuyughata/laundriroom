-- ============================================================================
-- 0004  Row-level security
-- Every table is RLS-protected. The anon/auth keys used by the browser can only
-- ever reach rows these policies allow. The service-role key (edge functions,
-- trusted server code) bypasses RLS for webhooks and payout release.
--
-- Helper functions (0003) are SECURITY DEFINER owned by the migration role, so
-- they read profiles/memberships without tripping these policies (no recursion).
-- ============================================================================

alter table profiles              enable row level security;
alter table customer_addresses    enable row level security;
alter table vendors               enable row level security;
alter table vendor_memberships    enable row level security;
alter table vendor_plans          enable row level security;
alter table item_types            enable row level security;
alter table price_list            enable row level security;
alter table tags                  enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table stage_events          enable row level security;
alter table invoices              enable row level security;
alter table payments              enable row level security;
alter table ledger_entries        enable row level security;
alter table delivery_fee_rules    enable row level security;
alter table notification_templates enable row level security;
alter table notification_rules    enable row level security;
alter table integration_settings  enable row level security;
alter table notification_log      enable row level security;
alter table audit_log             enable row level security;
alter table item_type_requests    enable row level security;
alter table payouts               enable row level security;
alter table service_extras        enable row level security;
alter table order_extras          enable row level security;
alter table platform_settings     enable row level security;
alter table order_daily_counter   enable row level security;  -- no policies: only definer funcs touch it

-- ─── profiles ───────────────────────────────────────────────────────────────
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on profiles for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ─── customer_addresses ─────────────────────────────────────────────────────
create policy addr_owner_all on customer_addresses for all
  using (customer_id = auth.uid() or is_admin())
  with check (customer_id = auth.uid());

-- ─── vendors ────────────────────────────────────────────────────────────────
-- Customers can see verified, open vendors (for matching). Staff see their own.
create policy vendors_public_read on vendors for select
  using (status = 'verified' or is_vendor_staff(id) or is_admin());
create policy vendors_manager_update on vendors for update
  using (is_vendor_manager(id) or is_platform_admin())
  with check (is_vendor_manager(id) or is_platform_admin());
create policy vendors_admin_write on vendors for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ─── vendor_memberships ─────────────────────────────────────────────────────
create policy memberships_read on vendor_memberships for select
  using (profile_id = auth.uid() or is_vendor_staff(vendor_id) or is_admin());
create policy memberships_admin_write on vendor_memberships for all
  using (is_platform_admin() or is_vendor_manager(vendor_id))
  with check (is_platform_admin() or is_vendor_manager(vendor_id));

-- ─── vendor_plans (read-only to everyone authenticated; admin writes) ────────
create policy plans_read on vendor_plans for select using (auth.uid() is not null);
create policy plans_admin_write on vendor_plans for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ─── item_types & price_list (customers need to read to place orders) ───────
create policy item_types_read on item_types for select using (auth.uid() is not null);
create policy item_types_write on item_types for all
  using (is_platform_admin() or (vendor_id is not null and is_vendor_manager(vendor_id)))
  with check (is_platform_admin() or (vendor_id is not null and is_vendor_manager(vendor_id)));

create policy price_read on price_list for select using (auth.uid() is not null);
create policy price_write on price_list for all
  using (is_vendor_manager(vendor_id) or is_platform_admin())
  with check (is_vendor_manager(vendor_id) or is_platform_admin());

-- ─── tags (vendor staff of the holding station) ─────────────────────────────
create policy tags_staff on tags for all
  using (is_admin() or (vendor_id is not null and is_vendor_staff(vendor_id)))
  with check (is_admin() or (vendor_id is not null and is_vendor_staff(vendor_id)));

-- ─── orders ─────────────────────────────────────────────────────────────────
create policy orders_read on orders for select
  using (customer_id = auth.uid() or is_vendor_staff(vendor_id) or is_admin());
create policy orders_customer_insert on orders for insert
  with check (customer_id = auth.uid());
create policy orders_staff_insert on orders for insert
  with check (is_vendor_staff(vendor_id));
create policy orders_staff_update on orders for update
  using (is_vendor_staff(vendor_id) or is_platform_admin())
  with check (is_vendor_staff(vendor_id) or is_platform_admin());

-- ─── order_items ────────────────────────────────────────────────────────────
create policy order_items_read on order_items for select
  using (
    exists (select 1 from orders o where o.id = order_id
            and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_admin()))
  );
create policy order_items_staff_write on order_items for all
  using (
    exists (select 1 from orders o where o.id = order_id
            and (is_vendor_staff(o.vendor_id) or is_platform_admin()))
  )
  with check (
    exists (select 1 from orders o where o.id = order_id
            and (is_vendor_staff(o.vendor_id) or is_platform_admin()))
  );

-- ─── stage_events ───────────────────────────────────────────────────────────
create policy stage_read on stage_events for select
  using (
    exists (select 1 from orders o where o.id = order_id
            and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_admin()))
  );
create policy stage_staff_insert on stage_events for insert
  with check (
    exists (select 1 from orders o where o.id = order_id and is_vendor_staff(o.vendor_id))
  );

-- ─── invoices & payments (read for the order's parties; writes via server) ──
create policy invoices_read on invoices for select
  using (
    exists (select 1 from orders o where o.id = order_id
            and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_admin()))
  );
create policy payments_read on payments for select
  using (
    exists (select 1 from orders o where o.id = order_id
            and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_admin()))
  );
-- Inserts/updates to payments come from edge functions (service role, bypasses RLS).

-- ─── ledger ─────────────────────────────────────────────────────────────────
create policy ledger_read on ledger_entries for select
  using (is_vendor_staff(vendor_id) or is_admin());
create policy ledger_write on ledger_entries for all
  using (is_vendor_manager(vendor_id) or is_platform_admin())
  with check (is_vendor_manager(vendor_id) or is_platform_admin());

-- ─── delivery_fee_rules ─────────────────────────────────────────────────────
create policy fees_read on delivery_fee_rules for select using (auth.uid() is not null);
create policy fees_admin_write on delivery_fee_rules for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ─── notifications & integrations (admin-managed) ───────────────────────────
create policy ntpl_read on notification_templates for select using (is_admin());
create policy ntpl_write on notification_templates for all
  using (is_platform_admin()) with check (is_platform_admin());

create policy nrules_read on notification_rules for select using (is_admin());
create policy nrules_write on notification_rules for all
  using (is_platform_admin()) with check (is_platform_admin());

-- Integration secrets: platform admin only, full stop.
create policy integrations_admin on integration_settings for all
  using (is_platform_admin()) with check (is_platform_admin());

create policy nlog_read on notification_log for select
  using (
    is_admin() or
    (order_id is not null and exists (
      select 1 from orders o where o.id = order_id and is_vendor_staff(o.vendor_id)))
  );

create policy audit_read on audit_log for select using (is_admin());

-- ─── item_type_requests ─────────────────────────────────────────────────────
create policy itr_read on item_type_requests for select
  using (is_vendor_staff(vendor_id) or is_admin());
create policy itr_insert on item_type_requests for insert
  with check (is_vendor_staff(vendor_id));
create policy itr_decide on item_type_requests for update
  using (is_vendor_manager(vendor_id) or is_platform_admin())
  with check (is_vendor_manager(vendor_id) or is_platform_admin());

-- ─── payouts ────────────────────────────────────────────────────────────────
create policy payouts_read on payouts for select
  using (is_vendor_staff(vendor_id) or is_admin());
create policy payouts_admin_write on payouts for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ─── premium extras catalogue (read for all authed; admin writes) ───────────
create policy extras_read on service_extras for select using (auth.uid() is not null);
create policy extras_admin_write on service_extras for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ─── order_extras (parties can read; the customer or vendor staff can write) ─
create policy order_extras_read on order_extras for select
  using (
    exists (select 1 from orders o where o.id = order_id
            and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_admin()))
  );
create policy order_extras_write on order_extras for all
  using (
    exists (select 1 from orders o where o.id = order_id
            and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_platform_admin()))
  )
  with check (
    exists (select 1 from orders o where o.id = order_id
            and (o.customer_id = auth.uid() or is_vendor_staff(o.vendor_id) or is_platform_admin()))
  );

-- ─── platform settings (read for all authed; admin writes) ──────────────────
create policy settings_read on platform_settings for select using (auth.uid() is not null);
create policy settings_admin_write on platform_settings for all
  using (is_platform_admin()) with check (is_platform_admin());
