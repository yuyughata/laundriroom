-- ═══════════════════════════════════════════════════════════════════════════
-- 0039 — Who did what on an order, and photos on support tickets.
--
-- 1. Staff attribution. Each staff member signs in with their own account,
--    so the database already knows who is acting:
--      order_items.checked_in_by  — who checked each item in (auth.uid())
--      orders.picked_up_by        — who confirmed the pickup PIN
--    (stage_events.pressed_by already records every stage and the handover,
--    and orders.created_by who entered the order.)
--    get_order_activity(order) returns the order's timeline with staff
--    names, for the order's vendor staff and admins.
-- 2. Support photos. support_messages.attachments holds up to 4 storage
--    paths in the private 'support-attachments' bucket. Files live under
--    the uploader's own folder (<user id>/…); the uploader and admins /
--    support agents can read them. A message can only reference its own
--    author's files, and author_id is always the signed-in user.
--
-- Written without DROP statements (policies are created only if missing),
-- so it can be applied to the live project as-is and re-run safely.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Staff attribution ───────────────────────────────────────────────────
alter table order_items add column if not exists checked_in_by uuid default auth.uid()
  references profiles (id) on delete set null;
comment on column order_items.checked_in_by is 'Staff member who checked the item in (set automatically).';

alter table orders add column if not exists picked_up_by uuid references profiles (id) on delete set null;
comment on column orders.picked_up_by is 'Staff member who confirmed the customer''s pickup PIN.';

create or replace function confirm_pickup(p_order uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'order not found'; end if;
  if not (can_staff_branch(o.vendor_id, o.branch_id) or is_admin()) then raise exception 'not authorized'; end if;
  if o.entry_mode <> 'pickup' then raise exception 'not a pickup order'; end if;
  if o.pickup_code is distinct from p_code then raise exception 'pin does not match'; end if;

  update orders
     set picked_up_at = coalesce(picked_up_at, now()),
         picked_up_by = coalesce(picked_up_by, auth.uid())
   where id = p_order;
end;
$$;

-- The order's timeline with who did each step. kind: placed | pickup | item |
-- stage (label = the stage key) | payment. staff_* are null for customer or
-- system steps.
create or replace function get_order_activity(p_order uuid)
returns table (at timestamptz, kind text, label text, staff_name text, staff_role text)
language sql stable security definer set search_path = public as $$
  with o as (
    select * from orders
     where id = p_order and (can_staff_branch(vendor_id, branch_id) or is_admin())
  )
  select x.at, x.kind, x.label, x.staff_name, x.staff_role from (
    select o.created_at as at, 'placed'::text as kind,
           case when o.created_by is not null and o.created_by is distinct from o.customer_id
                then 'entered' else 'customer' end as label,
           p.full_name as staff_name, p.role::text as staff_role
      from o left join profiles p
        on p.id = o.created_by and o.created_by is distinct from o.customer_id
    union all
    select o.picked_up_at, 'pickup', 'confirmed', p.full_name, p.role::text
      from o left join profiles p on p.id = o.picked_up_by
     where o.picked_up_at is not null
    union all
    select oi.created_at, 'item', oi.sub_code || ' · ' || coalesce(it.name, 'Item'), p.full_name, p.role::text
      from o join order_items oi on oi.order_id = o.id
      left join item_types it on it.id = oi.item_type_id
      left join profiles p on p.id = oi.checked_in_by
    union all
    select se.created_at, 'stage', se.stage::text || case when se.skipped then ':skipped' else '' end,
           p.full_name, p.role::text
      from o join stage_events se on se.order_id = o.id
      left join profiles p on p.id = se.pressed_by
    union all
    select coalesce(pm.paid_at, pm.created_at), 'payment', pm.amount::text, null, null
      from o join payments pm on pm.order_id = o.id and pm.status = 'succeeded'
  ) x
  order by x.at, x.kind;
$$;
revoke execute on function get_order_activity(uuid) from public, anon;
grant execute on function get_order_activity(uuid) to authenticated;

-- ─── 2. Support photos ──────────────────────────────────────────────────────
alter table support_messages add column if not exists attachments jsonb not null default '[]'::jsonb;
comment on column support_messages.attachments is 'Storage paths in the support-attachments bucket (up to 4 photos).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'support_messages_attachments_max') then
    alter table support_messages add constraint support_messages_attachments_max
      check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 4);
  end if;
end $$;

-- The author is always the signed-in user, and a message can only point at
-- that author's own uploaded files.
create or replace function guard_support_message() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
  end if;
  if exists (select 1 from jsonb_array_elements_text(new.attachments) a(path)
              where new.author_id is null or a.path not like new.author_id::text || '/%') then
    raise exception 'Attachments must be your own uploads.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function guard_support_message() from public, anon, authenticated;
create or replace trigger support_messages_guard before insert on support_messages
  for each row execute function guard_support_message();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'support attachments upload') then
    create policy "support attachments upload" on storage.objects for insert
      with check (bucket_id = 'support-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'support attachments read') then
    create policy "support attachments read" on storage.objects for select
      using (bucket_id = 'support-attachments'
             and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
  end if;
end $$;
