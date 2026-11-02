-- ============================================================================
-- 0015  Commission-only model
-- Subscription and combined plans are retired. Commission is the single model.
-- Any vendor on a subscription/combined plan is moved to the default commission
-- plan, and those plans are deactivated so they no longer appear anywhere.
-- (The plan_type enum is left in place for history; the app only offers
--  'commission' from here on.)
-- ============================================================================

-- Make sure there is an active, default commission plan to fall back to.
update vendor_plans set active = true
  where is_default = true and type = 'commission';

-- Move any vendor off a subscription/combined plan onto the default commission plan.
update vendors v
  set plan_id = (select id from vendor_plans where is_default and active and type = 'commission' limit 1)
  where plan_id in (select id from vendor_plans where type in ('subscription', 'combined'));

-- Retire the non-commission plans (hidden everywhere: the app lists active only).
update vendor_plans
  set active = false, is_default = false
  where type in ('subscription', 'combined');

-- Zero any leftover monthly fees so no subscription amount lingers on a plan.
update vendor_plans set monthly_fee = 0 where monthly_fee <> 0;
