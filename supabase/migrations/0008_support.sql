-- ============================================================================
-- 0008  Support & complaints
-- Customers raise tickets against predefined categories/subcategories (with an
-- "Other" free-text option), optionally tied to an order. Each ticket is a
-- thread: the opening message plus replies from the customer and support.
-- ============================================================================

create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type ticket_priority as enum ('low', 'normal', 'high');

create table support_tickets (
  id          uuid primary key default gen_random_uuid(),
  number      bigint generated always as identity,          -- shown as "#123"
  customer_id uuid not null references profiles (id),
  order_id    uuid references orders (id),                  -- optional link to an order
  category    text not null,
  subcategory text,
  other_text  text,                                          -- when the subcategory is "Other"
  subject     text not null,
  status      ticket_status not null default 'open',
  priority    ticket_priority not null default 'normal',
  assigned_to uuid references profiles (id),                -- a support agent / admin
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index support_tickets_customer_idx on support_tickets (customer_id, created_at desc);
create index support_tickets_status_idx on support_tickets (status, created_at desc);

create table support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets (id) on delete cascade,
  author_id   uuid references profiles (id),
  from_support boolean not null default false,              -- support reply vs customer message
  body        text not null,
  created_at  timestamptz not null default now()
);
create index support_messages_ticket_idx on support_messages (ticket_id, created_at);

create trigger support_tickets_updated
  before update on support_tickets
  for each row execute function set_updated_at();

-- Bump the ticket's updated_at whenever a message is added.
create or replace function touch_ticket_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update support_tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;
create trigger support_messages_touch
  after insert on support_messages
  for each row execute function touch_ticket_on_message();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table support_tickets  enable row level security;
alter table support_messages enable row level security;

-- Tickets: a customer sees and opens their own; support/admin see and manage all.
create policy tickets_read on support_tickets for select
  using (customer_id = auth.uid() or is_admin());
create policy tickets_customer_insert on support_tickets for insert
  with check (customer_id = auth.uid());
create policy tickets_support_update on support_tickets for update
  using (is_admin()) with check (is_admin());

-- Messages: the ticket's customer and support/admin can read and add messages.
create policy tmsg_read on support_messages for select
  using (exists (select 1 from support_tickets t
                 where t.id = ticket_id and (t.customer_id = auth.uid() or is_admin())));
create policy tmsg_insert on support_messages for insert
  with check (exists (select 1 from support_tickets t
                      where t.id = ticket_id and (t.customer_id = auth.uid() or is_admin())));
