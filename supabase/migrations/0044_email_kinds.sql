-- ═══════════════════════════════════════════════════════════════════════════
-- 0044  Emails: a newsletter is one kind of email broadcast
--   Admin → Newsletters becomes Admin → Emails. Each broadcast has a kind:
--   newsletter, promotion, announcement or service update. The tables keep
--   their names (newsletters, newsletter_recipients). Opt-out still applies
--   to every kind. Once sent, the kind is locked with the rest of the email.
--   Drop-free; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table newsletters add column if not exists kind text not null default 'newsletter';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'newsletters_kind_check') then
    alter table newsletters add constraint newsletters_kind_check
      check (kind in ('newsletter', 'promotion', 'announcement', 'update'));
  end if;
end $$;
comment on column newsletters.kind is 'Type of email broadcast: newsletter, promotion, announcement or update (service update).';

-- Same as 0043, plus the kind.
create or replace function guard_newsletter() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if current_user in ('anon', 'authenticated') then
    if old.status <> 'draft' and (
         new.subject is distinct from old.subject or new.body_html is distinct from old.body_html
      or new.header_image_url is distinct from old.header_image_url or new.footer_image_url is distinct from old.footer_image_url
      or new.cta_label is distinct from old.cta_label or new.cta_url is distinct from old.cta_url
      or new.audience is distinct from old.audience or new.preheader is distinct from old.preheader
      or new.kind is distinct from old.kind) then
      raise exception 'This email has been sent and can''t be edited. Duplicate it instead.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status or new.sent_count is distinct from old.sent_count
       or new.failed_count is distinct from old.failed_count or new.recipient_count is distinct from old.recipient_count
       or new.sent_at is distinct from old.sent_at then
      raise exception 'not allowed to change the sending status' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
