-- ============================================================================
-- 0001  Extensions and enums
-- laundriroom — core type vocabulary. Keeping enums in one place means the
-- app and the database agree on every status string.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";      -- case-insensitive email

-- --- People ------------------------------------------------------------------
create type user_role as enum (
  'customer',
  'attendant',
  'vendor_manager',
  'rider',
  'platform_admin',
  'support_agent'
);

create type account_status as enum ('active', 'suspended', 'invited');

-- --- Vendors -----------------------------------------------------------------
create type vendor_status as enum ('pending', 'verified', 'suspended', 'rejected');
create type delivery_mode as enum ('own_riders', 'dispatch_partner', 'both');
create type plan_type     as enum ('commission', 'subscription', 'combined');

-- --- Catalogue ---------------------------------------------------------------
-- The kind of laundry work done to an item.
create type service_type as enum ('wash_and_fold', 'dry_clean', 'press_only');

-- Quality tier for an order. 'premium' unlocks admin-defined extras (see
-- service_extras); 'standard' is the default.
create type service_tier as enum ('standard', 'premium');

-- Turnaround speed. Orders are 'normal' by default; a customer can choose
-- 'express' (faster, with a surcharge) on either tier.
create type turnaround as enum ('normal', 'express');

-- --- Orders ------------------------------------------------------------------
create type entry_mode     as enum ('pickup', 'drop_off');
create type return_mode    as enum ('delivery', 'collection');
create type delivered_by   as enum ('own_rider', 'dispatch_partner');
create type payment_timing as enum ('online', 'on_delivery');

-- The ordered lifecycle every order passes through (see order lifecycle diagram).
create type order_status as enum (
  'awaiting_dropoff',   -- drop-off order created, items not yet checked in
  'pickup_requested',   -- pickup order created, awaiting rider
  'checked_in',         -- items received, priced, tagged
  'processing',         -- one or more stages in progress
  'ready',              -- final completion done; ready to deliver or collect
  'out_for_delivery',   -- with a rider / dispatch partner
  'awaiting_collection',-- waiting for the customer to come in
  'closed',             -- handed over (code) or paid on delivery
  'cancelled'
);

create type order_item_status as enum ('checked_in', 'processing', 'done', 'packaged', 'handed_over');

-- A processing stage. Stages run in order; skipping needs manager permission.
create type stage_kind as enum (
  'check_in',
  'sorting',
  'washing',
  'drying',
  'pressing',
  'quality_check',
  'packaging',
  'final_completion',
  'out_for_delivery',
  'handover'
);

-- --- Money -------------------------------------------------------------------
create type invoice_status as enum ('draft', 'issued', 'paid', 'void');
create type payment_method as enum ('paystack', 'flutterwave', 'manual');
create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type ledger_entry_type as enum ('income', 'expense', 'adjustment');
create type payout_status as enum ('held', 'due', 'sent', 'failed');

-- --- Delivery fees -----------------------------------------------------------
create type fee_scope as enum ('global', 'zone', 'vendor');
create type fee_type  as enum ('flat', 'distance_band');

-- --- Tags --------------------------------------------------------------------
create type tag_status as enum ('free', 'in_use', 'retired');

-- --- Item type requests ------------------------------------------------------
create type request_status as enum ('pending', 'approved', 'rejected');

-- --- Notifications & integrations -------------------------------------------
create type notif_channel as enum ('email', 'whatsapp', 'sms');
create type notif_event as enum (
  'order_confirmed',
  'pickup_assigned',
  'checked_in',
  'stage_complete',
  'ready_for_delivery',
  'out_for_delivery',
  'payment_due',
  'payment_received',
  'order_closed',
  'item_type_requested',
  'item_type_approved',
  'payout_sent',
  'email_verification',
  'email_verification_reminder'
);
create type notif_status as enum ('queued', 'sent', 'delivered', 'failed', 'skipped');
create type integration_provider as enum ('resend', 'whatsapp', 'sms');
create type integration_status as enum ('not_configured', 'connected', 'error');
