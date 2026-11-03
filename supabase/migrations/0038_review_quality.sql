-- ═══════════════════════════════════════════════════════════════════════════
-- 0038 — Bad reviews: tell the vendor, flag to admins, escalate in steps.
--
-- A "bad" review is 1 or 2 stars.
-- 1. Every bad review emails/WhatsApps the vendor (that branch's staff and
--    business-wide staff) asking them to look into it, contact the customer
--    and resolve it promptly — and alerts admins (event review_low). The app
--    fires it when the review is saved.
-- 2. get_review_watchlist() — admins: per vendor, bad reviews in the last 30
--    days vs the 30 days before, last 90 days, average ratings, and a level:
--      flagged  3+ bad in 30 days, or 2+ and more than the previous 30 days
--               (rising), or 30%+ of 5+ reviews in 30 days were bad
--      watch    at least one bad review in 30 days
--    plus the current escalation step.
-- 3. vendor_quality_actions — the escalation trail an admin takes:
--      inquiry → warning → suspension (and 'resolved' to close a case).
--    Each step messages the vendor; suspension also sets the vendor's status.
--    The vendor's main manager can reply to an inquiry/warning in the app
--    (respond_quality_action).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Notification rules + WhatsApp text ─────────────────────────────────────
insert into notification_rules (event, channels, fallback_order, recipients, enabled)
select e::notif_event, '{email,whatsapp}'::notif_channel[], '{whatsapp,email}'::notif_channel[], r::text[], true
from (values ('review_low', '{vendor,admin}'), ('vendor_inquiry', '{vendor}'),
             ('vendor_warning', '{vendor}'), ('vendor_suspended', '{vendor}')) as x(e, r)
where not exists (select 1 from notification_rules n where n.event = x.e::notif_event);

insert into notification_templates (event, channel, subject, body)
select x.e::notif_event, 'whatsapp', null, x.b
from (values
  ('review_low', 'laundriroom: order {{order_code}} at {{vendor_name}} got a {{rating}}★ review: "{{review_comment}}". Please look into it, contact the customer ({{customer_phone}}) and resolve it promptly.'),
  ('vendor_inquiry', 'laundriroom: we''d like to understand recent customer reviews at {{vendor_name}}. {{action_message}} Please reply in your dashboard: {{reviews_url}}'),
  ('vendor_warning', 'laundriroom WARNING for {{vendor_name}}: {{action_message}} Continued bad reviews may lead to suspension. Respond in your dashboard: {{reviews_url}}'),
  ('vendor_suspended', 'laundriroom: {{vendor_name}} has been suspended from the platform. {{action_message}} Contact support to discuss: {{support_url}}')
) as x(e, b)
where not exists (select 1 from notification_templates t where t.event = x.e::notif_event and t.channel = 'whatsapp');

-- ─── Escalation trail ───────────────────────────────────────────────────────
create table if not exists vendor_quality_actions (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references vendors (id) on delete cascade,
  stage           text not null check (stage in ('inquiry', 'warning', 'suspension', 'resolved')),
  message         text not null check (length(btrim(message)) > 0),
  created_by      uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  vendor_response text,
  responded_by    uuid references profiles (id) on delete set null,
  responded_at    timestamptz
);
create index if not exists vendor_quality_actions_vendor_idx on vendor_quality_actions (vendor_id, created_at desc);
comment on table vendor_quality_actions is 'Admin steps on a vendor with bad reviews: inquiry → warning → suspension, or resolved.';

alter table vendor_quality_actions enable row level security;
drop policy if exists vqa_read on vendor_quality_actions;
create policy vqa_read on vendor_quality_actions for select using (is_vendor_staff(vendor_id) or is_admin());
drop policy if exists vqa_admin_write on vendor_quality_actions;
create policy vqa_admin_write on vendor_quality_actions for all
  using (is_platform_admin()) with check (is_platform_admin());

-- The vendor's main manager answers an inquiry or warning.
create or replace function respond_quality_action(p_action uuid, p_response text) returns void
language plpgsql security definer set search_path = public as $$
declare a vendor_quality_actions%rowtype;
begin
  select * into a from vendor_quality_actions where id = p_action;
  if a.id is null then raise exception 'not found'; end if;
  if not is_vendor_manager(a.vendor_id) then raise exception 'Only the business''s main manager can respond.' using errcode = '42501'; end if;
  if a.stage not in ('inquiry', 'warning') then raise exception 'This step doesn''t take a response.'; end if;
  if length(btrim(coalesce(p_response, ''))) < 10 then raise exception 'Please write a short explanation (10+ characters).'; end if;
  update vendor_quality_actions
     set vendor_response = left(btrim(p_response), 4000), responded_by = auth.uid(), responded_at = now()
   where id = p_action;
end;
$$;
revoke execute on function respond_quality_action(uuid, text) from public, anon;
grant execute on function respond_quality_action(uuid, text) to authenticated;

-- ─── Watchlist ──────────────────────────────────────────────────────────────
create or replace function get_review_watchlist()
returns table (
  vendor_id uuid, vendor_name text, vendor_status vendor_status,
  reviews_30 int, bad_30 int, bad_prev_30 int, bad_90 int,
  avg_30 numeric, avg_all numeric, reviews_all int, last_bad_at timestamptz,
  level text, reason text, stage text, stage_at timestamptz, vendor_responded boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return query
  with s as (
    select v.id, v.name, v.status,
      count(r.*) filter (where r.created_at > now() - interval '30 days')::int as r30,
      count(r.*) filter (where r.rating <= 2 and r.created_at > now() - interval '30 days')::int as b30,
      count(r.*) filter (where r.rating <= 2 and r.created_at <= now() - interval '30 days'
                                            and r.created_at > now() - interval '60 days')::int as bp30,
      count(r.*) filter (where r.rating <= 2 and r.created_at > now() - interval '90 days')::int as b90,
      round(avg(r.rating) filter (where r.created_at > now() - interval '30 days'), 1) as a30,
      round(avg(r.rating), 1) as aall,
      count(r.*)::int as rall,
      max(r.created_at) filter (where r.rating <= 2) as lastbad
    from vendors v left join reviews r on r.vendor_id = v.id
    group by v.id
  ), a as (
    select distinct on (q.vendor_id) q.vendor_id, q.stage, q.created_at, q.vendor_response is not null as responded
      from vendor_quality_actions q order by q.vendor_id, q.created_at desc
  ), lv as (
    select s.*, a.stage as st, a.created_at as st_at, coalesce(a.responded, false) as resp,
      case
        when s.b30 >= 3 then 'flagged'
        when s.b30 >= 2 and s.b30 > s.bp30 then 'flagged'
        when s.r30 >= 5 and s.b30::numeric / s.r30 >= 0.3 then 'flagged'
        when s.b30 >= 1 then 'watch'
        else 'ok' end as lvl,
      case
        when s.b30 >= 3 then format('%s bad reviews in the last 30 days', s.b30)
        when s.b30 >= 2 and s.b30 > s.bp30 then format('Bad reviews rising: %s in the last 30 days (was %s)', s.b30, s.bp30)
        when s.r30 >= 5 and s.b30::numeric / s.r30 >= 0.3 then format('%s%% of recent reviews are bad', round(100.0 * s.b30 / s.r30))
        when s.b30 >= 1 then format('%s bad review%s in the last 30 days', s.b30, case when s.b30 = 1 then '' else 's' end)
        else '' end as why
    from s left join a on a.vendor_id = s.id
  )
  select lv.id, lv.name, lv.status, lv.r30, lv.b30, lv.bp30, lv.b90, lv.a30, lv.aall, lv.rall, lv.lastbad,
         lv.lvl, lv.why, lv.st, lv.st_at, lv.resp
    from lv
   where lv.lvl <> 'ok' or (lv.st is not null and lv.st <> 'resolved')
   order by case lv.lvl when 'flagged' then 0 when 'watch' then 1 else 2 end, lv.b30 desc, lv.lastbad desc nulls last;
end;
$$;
revoke execute on function get_review_watchlist() from public, anon;
grant execute on function get_review_watchlist() to authenticated;
