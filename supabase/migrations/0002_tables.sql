-- ============================================================================
-- 0002  Tables
-- The full relational model: 18 entity groups from the build plan's data model.
-- Records are never hard-deleted (see business rules); corrections are posted
-- as ledger adjustments and orders carry a cancelled status instead.
-- ============================================================================

-- ─── People ─────────────────────────────────────────────────────────────────
-- Mirrors auth.users. One row per person; a membership row ties staff to a
-- vendor with a role. Customers have a profile but no vendor membership.
create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null default '',
  email           citext,
  phone           text,
  role            user_role not null default 'customer',
  status          account_status not null default 'active',
  email_verified  boolean not null default false,
  verify_reminders_sent int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table customer_addresses (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles (id) on delete cascade,
  label       text not null default 'Home',
  line1       text not null,
  area        text,
  city        text,
  lat         double precision,
  lng         double precision,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ─── Vendors and locations ──────────────────────────────────────────────────
create table vendors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  status          vendor_status not null default 'pending',
  documents       jsonb not null default '[]',          -- uploaded verification docs (storage paths)
  delivery        delivery_mode not null default 'own_riders',
  plan_id         uuid,                                   -- FK added after vendor_plans exists
  address_line    text,
  area            text,
  city            text,
  lat             double precision,
  lng             double precision,
  service_radius_km numeric(5,2) not null default 5,
  opens_at        time not null default '07:00',           -- drop-off/pickup hours
  closes_at       time not null default '18:00',
  is_open         boolean not null default true,          -- manual open/closed toggle
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Staff belong to a vendor with an operational role (attendant / manager / rider).
create table vendor_memberships (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references vendors (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  role       user_role not null,                          -- attendant | vendor_manager | rider
  created_at timestamptz not null default now(),
  unique (vendor_id, profile_id)
);

-- ─── Business model: vendor plans ───────────────────────────────────────────
create table vendor_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            plan_type not null,
  commission_rate numeric(5,4) not null default 0,        -- 0.1500 = 15% of the whole order total
  monthly_fee     numeric(12,2) not null default 0,       -- NGN
  is_default      boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table vendors
  add constraint vendors_plan_fk foreign key (plan_id) references vendor_plans (id);

-- ─── Catalogue: item types, services, price list ────────────────────────────
create table item_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  icon       text,                                        -- icon key for the UI picker
  is_global  boolean not null default true,               -- global catalogue vs vendor-specific
  vendor_id  uuid references vendors (id) on delete cascade,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Per-vendor price for an (item_type, service). Changing a price never alters
-- past orders — order_items snapshot the price at check-in.
create table price_list (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references vendors (id) on delete cascade,
  item_type_id uuid not null references item_types (id) on delete cascade,
  service     service_type not null,
  price       numeric(12,2) not null,
  currency    text not null default 'NGN',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (vendor_id, item_type_id, service)
);

-- ─── Premium extras ─────────────────────────────────────────────────────────
-- Admin-managed catalogue of extras available on premium orders (e.g. premium
-- detergent, hand finishing, stain treatment). Priced; snapshotted onto orders.
create table service_extras (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric(12,2) not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── Tags: pre-printed QR / numbered polyester tags ─────────────────────────
create table tags (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                     -- printed number / QR payload
  batch         text,
  status        tag_status not null default 'free',
  vendor_id     uuid references vendors (id),             -- which station holds the batch
  current_item_id uuid,                                   -- FK added after order_items exists
  created_at    timestamptz not null default now()
);

-- ─── Orders ─────────────────────────────────────────────────────────────────
create table orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,                    -- ORD-YYMMDD-NNNN, generated at creation
  customer_id    uuid not null references profiles (id),
  vendor_id      uuid not null references vendors (id),
  entry_mode     entry_mode not null,
  return_mode    return_mode not null,
  delivered_by   delivered_by,                            -- set when return_mode = delivery
  payment_timing payment_timing not null default 'online',
  service_tier   service_tier not null default 'standard', -- standard | premium
  turnaround     turnaround not null default 'normal',     -- normal | express
  status         order_status not null default 'awaiting_dropoff',
  delivery_fee   numeric(12,2) not null default 0,        -- snapshot at creation
  express_fee    numeric(12,2) not null default 0,        -- platform markup (express_pct × vendor subtotal)
  premium_fee    numeric(12,2) not null default 0,        -- platform markup (premium_pct × vendor subtotal)
  reschedule_penalty numeric(12,2) not null default 0,    -- accrued non-collection penalty
  delivery_attempts int not null default 0,               -- failed/rescheduled delivery count
  items_total    numeric(12,2) not null default 0,        -- sum of item price snapshots
  extras_total   numeric(12,2) not null default 0,        -- sum of premium extra snapshots
  total          numeric(12,2) not null default 0,        -- vendor subtotal + delivery + markups + penalty
  handover_code  text,                                    -- 4-digit code for prepaid handover
  pickup_address_id uuid references customer_addresses (id),
  notes          text,
  created_at     timestamptz not null default now(),
  checked_in_at  timestamptz,
  ready_at       timestamptz,
  completed_at   timestamptz,                             -- when work finished (payout clock basis)
  closed_at      timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text
);
create index orders_vendor_idx   on orders (vendor_id, status);
create index orders_customer_idx on orders (customer_id, created_at desc);

create table order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders (id) on delete cascade,
  sub_code        text not null,                          -- ORD-YYMMDD-0042-01
  item_type_id    uuid not null references item_types (id),
  service         service_type not null,
  price_at_checkin numeric(12,2) not null,                -- price snapshot
  customer_comment text,
  tag_code        text,
  status          order_item_status not null default 'checked_in',
  photos          jsonb not null default '[]',            -- storage paths
  created_at      timestamptz not null default now(),
  unique (order_id, sub_code)
);
create index order_items_order_idx on order_items (order_id);

-- Premium extras chosen on an order, with the price snapshotted at selection.
create table order_extras (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders (id) on delete cascade,
  extra_id   uuid references service_extras (id),
  name       text not null,                                -- snapshot of the extra's name
  price      numeric(12,2) not null,                       -- snapshot of the price
  created_at timestamptz not null default now()
);
create index order_extras_order_idx on order_extras (order_id);

-- link a tag to its current item now that order_items exists
alter table tags
  add constraint tags_current_item_fk foreign key (current_item_id) references order_items (id);

-- ─── Stage events ───────────────────────────────────────────────────────────
-- An append-only log of who pressed which stage and when.
create table stage_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders (id) on delete cascade,
  stage      stage_kind not null,
  pressed_by uuid references profiles (id),
  skipped    boolean not null default false,
  note       text,
  created_at timestamptz not null default now()
);
create index stage_events_order_idx on stage_events (order_id, created_at);

-- ─── Invoices and payments ──────────────────────────────────────────────────
create table invoices (
  id          uuid primary key default gen_random_uuid(),
  number      bigint generated always as identity,        -- sequential invoice number
  order_id    uuid not null references orders (id) on delete cascade,
  amount      numeric(12,2) not null,
  status      invoice_status not null default 'issued',
  pdf_path    text,                                        -- storage path once exported
  issued_at   timestamptz not null default now(),
  unique (order_id)
);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id) on delete cascade,
  invoice_id  uuid references invoices (id),
  amount      numeric(12,2) not null,
  method      payment_method not null default 'paystack',
  status      payment_status not null default 'pending',
  reference   text,                                        -- provider reference
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index payments_order_idx on payments (order_id);

-- ─── Ledger ─────────────────────────────────────────────────────────────────
create table ledger_entries (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references vendors (id) on delete cascade,
  type       ledger_entry_type not null,
  amount     numeric(12,2) not null,
  order_id   uuid references orders (id),
  reason     text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index ledger_vendor_idx on ledger_entries (vendor_id, created_at desc);

-- ─── Delivery fee rules ─────────────────────────────────────────────────────
create table delivery_fee_rules (
  id         uuid primary key default gen_random_uuid(),
  scope      fee_scope not null,
  vendor_id  uuid references vendors (id) on delete cascade,  -- when scope = vendor
  zone       text,                                            -- when scope = zone
  type       fee_type not null default 'flat',
  flat_amount numeric(12,2),
  bands      jsonb,                                            -- [{max_km, amount}, ...] for distance_band
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Platform settings (single row) ─────────────────────────────────────────
-- Admin-tunable fees & charges. One row, id = true. Percentages are fractions
-- (0.2000 = 20%). Express and premium markups are platform revenue added on top
-- of the vendor's price; the non-collection penalty is charged on the delivery
-- fee when a delivery is rescheduled because the customer wasn't available.
create table platform_settings (
  id                         boolean primary key default true check (id),
  express_pct                numeric(5,4) not null default 0,  -- markup on express orders
  premium_pct                numeric(5,4) not null default 0,  -- markup on premium orders
  noncollection_penalty_pct  numeric(5,4) not null default 0,  -- % of delivery fee per reschedule
  updated_at                 timestamptz not null default now()
);

-- ─── Notifications & integrations ───────────────────────────────────────────
create table notification_templates (
  id         uuid primary key default gen_random_uuid(),
  event      notif_event not null,
  channel    notif_channel not null,
  subject    text,                                          -- email subject
  body       text not null,                                 -- supports {{placeholders}}
  updated_at timestamptz not null default now(),
  unique (event, channel)
);

-- One rule row per event: which channels fire, in what fallback order, who gets it.
create table notification_rules (
  id             uuid primary key default gen_random_uuid(),
  event          notif_event not null unique,
  channels       notif_channel[] not null default '{email}',   -- active channels
  fallback_order notif_channel[] not null default '{whatsapp,email}',
  recipients     text[] not null default '{customer}',          -- customer|vendor|admin
  enabled        boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- Resend / WhatsApp / SMS connection settings. API details are stored encrypted
-- at the application/edge layer; this table holds status and metadata, and the
-- encrypted secret reference — never the plaintext key.
create table integration_settings (
  id           uuid primary key default gen_random_uuid(),
  provider     integration_provider not null unique,
  status       integration_status not null default 'not_configured',
  secret_ref   text,                                         -- pointer to the encrypted secret (vault / edge secret)
  config       jsonb not null default '{}',                  -- non-secret config: sender id, phone id, from-address
  last_test_at timestamptz,
  last_test_ok boolean,
  changed_by   uuid references profiles (id),
  updated_at   timestamptz not null default now()
);

create table notification_log (
  id         uuid primary key default gen_random_uuid(),
  event      notif_event not null,
  channel    notif_channel not null,
  order_id   uuid references orders (id),
  recipient  text,
  status     notif_status not null default 'queued',
  detail     text,
  created_at timestamptz not null default now()
);
create index notification_log_order_idx on notification_log (order_id, created_at);

create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references profiles (id),
  action     text not null,
  entity     text,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- ─── Item type requests ─────────────────────────────────────────────────────
create table item_type_requests (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors (id) on delete cascade,
  requested_by uuid not null references profiles (id),
  item_name    text not null,
  service      service_type,
  price        numeric(12,2),
  status       request_status not null default 'pending',
  approved_by  uuid references profiles (id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ─── Payouts ────────────────────────────────────────────────────────────────
create table payouts (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors (id) on delete cascade,
  order_ids    uuid[] not null default '{}',
  gross        numeric(12,2) not null default 0,
  fee          numeric(12,2) not null default 0,           -- commission or plan fee
  net          numeric(12,2) not null default 0,
  due_at       timestamptz not null,                        -- completed_at + 24h
  status       payout_status not null default 'held',
  reference    text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index payouts_vendor_idx on payouts (vendor_id, status);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated   before update on profiles   for each row execute function set_updated_at();
create trigger vendors_updated    before update on vendors    for each row execute function set_updated_at();
create trigger integrations_updated before update on integration_settings for each row execute function set_updated_at();
