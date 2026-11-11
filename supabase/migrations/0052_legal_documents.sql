-- 0052_legal_documents.sql
--
-- Public legal pages (Privacy Policy, Terms of Use, Privacy Choices/cookies),
-- linked in the homepage footer and edited by platform admins exactly like the
-- Partner Agreement (0034): a list of ordered clauses per document. Plus a
-- record that a customer accepted the terms at sign-up.

create table if not exists legal_clauses (
  id         uuid primary key default gen_random_uuid(),
  doc        text not null check (doc in ('privacy', 'terms', 'cookies')),
  position   int not null default 0,
  title      text not null,
  body       text not null,                       -- paragraphs separated by a blank line
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_clauses_title_nonempty check (length(btrim(title)) > 0),
  constraint legal_clauses_body_nonempty check (length(btrim(body)) > 0)
);
create index if not exists legal_clauses_doc_pos_idx on legal_clauses (doc, position);
comment on table legal_clauses is 'Privacy Policy / Terms of Use / Privacy Choices clauses; public read, managed by platform admins.';

drop trigger if exists legal_clauses_updated_at on legal_clauses;
create trigger legal_clauses_updated_at before update on legal_clauses
  for each row execute function set_updated_at();

alter table legal_clauses enable row level security;
drop policy if exists legal_read on legal_clauses;
create policy legal_read on legal_clauses for select
  using (active or is_platform_admin());
drop policy if exists legal_admin_write on legal_clauses;
create policy legal_admin_write on legal_clauses for all
  using (is_platform_admin()) with check (is_platform_admin());
grant select on legal_clauses to anon, authenticated;

-- Record of a customer accepting the Terms/Privacy at sign-up.
alter table profiles add column if not exists terms_accepted_at timestamptz;

-- Seed starter content once (admins edit these at Admin → Legal pages).
do $$
begin
  if not exists (select 1 from legal_clauses) then
    insert into legal_clauses (doc, position, title, body) values
    ('privacy', 1, 'Overview',
      'This Privacy Policy explains how laundriroom ("we", "us") collects, uses and protects your information when you use our apps, websites and services. By using laundriroom you agree to this policy.'
      || E'\n\n' ||
      'We are committed to handling your data responsibly and in line with the Nigeria Data Protection Act and other applicable laws.'),
    ('privacy', 2, 'Information we collect',
      'Account details you give us such as your name, phone number and email address; the pickup and delivery addresses you save; and the details of the orders you place.'
      || E'\n\n' ||
      'Usage and device information needed to run the service, and payment information processed securely by our payment partner — we do not store your full card details.'),
    ('privacy', 3, 'How we use your information',
      'To create and manage your account, take and fulfil your laundry orders, arrange pickup and delivery, process payments and payouts, provide support, and send you order updates and service messages.'
      || E'\n\n' ||
      'We share only what is needed with the laundry handling your order and with delivery and payment partners so they can perform their part of the service.'),
    ('privacy', 4, 'Keeping your data safe',
      'We keep your information only as long as needed to provide the service and meet our legal and accounting obligations, and we protect it with appropriate technical and organisational measures.'),
    ('privacy', 5, 'Your choices and contact',
      'You can access or update your details in your account, opt out of marketing emails at any time, and ask us to correct or delete your data. To exercise your rights or ask a question, contact us at hello@laundriroom.app.'),

    ('terms', 1, 'Agreement to these terms',
      'These Terms of Use govern your access to and use of laundriroom. By creating an account or placing an order, you agree to these terms. If you do not agree, please do not use the service.'),
    ('terms', 2, 'Your account',
      'You are responsible for the accuracy of the details you provide and for keeping your login secure. You must be able to form a binding contract to use laundriroom, and you agree to use it only for lawful purposes.'),
    ('terms', 3, 'Orders, pricing and payment',
      'Prices are shown before you confirm an order and are charged in Nigerian Naira. The price you are quoted at checkout is the price you pay. Some orders may be paid on delivery where offered.'
      || E'\n\n' ||
      'Laundries on the platform are independent businesses responsible for the service they provide. We facilitate ordering, tracking and payment between you and the laundry.'),
    ('terms', 4, 'Pickup, delivery and collection',
      'Where you choose pickup or delivery, please be available at the agreed time and provide a correct address. A delivery code is used to confirm handover. Fees for pickup and delivery, where they apply, are shown before you confirm.'),
    ('terms', 5, 'Acceptable use',
      'You agree not to misuse the service, attempt to disrupt it, or use it to break the law. We may suspend or close accounts that breach these terms.'),
    ('terms', 6, 'Liability and disputes',
      'The service is provided on a reasonable-efforts basis. Nothing in these terms excludes liability that cannot be excluded by law. If something goes wrong with an order, contact support so we can help resolve it.'),

    ('cookies', 1, 'Cookies and similar technologies',
      'laundriroom uses cookies and similar technologies to keep you signed in, remember your preferences, keep the service secure, and understand how it is used so we can improve it.'),
    ('cookies', 2, 'The cookies we use',
      'Essential cookies are needed for the site to work and cannot be switched off. Preference and analytics technologies help us remember your choices and measure performance; these are optional.'),
    ('cookies', 3, 'Your privacy choices',
      'You can control cookies through your browser or device settings, and manage your marketing email preferences from your account. Blocking essential cookies may stop parts of the service from working.');
  end if;
end $$;
