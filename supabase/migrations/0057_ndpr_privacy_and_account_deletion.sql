-- 0057_ndpr_privacy_and_account_deletion.sql
--
-- NDPR (Nigeria Data Protection Regulation / NDPA 2023) readiness:
--   1. Expand the public Privacy Policy to cover the processors we use, where
--      data is stored (EU) and international transfers, retention, the data
--      subject's NDPR rights, and a Data Protection Officer contact. These are
--      editable afterwards at Admin → Legal pages like any other clause.
--   2. Add profiles.deleted_at so a customer can erase their own account
--      (anonymise-in-place; order/payment records are retained for legal and
--      accounting obligations, as the NDPR permits).
--
-- Clause changes are written as position-keyed UPDATEs (1–5, already seeded by
-- 0052) plus guarded INSERTs (6–9), so this migration is safe to re-run and a
-- fresh database still ends up with the full policy.

-- ── 1. Account erasure marker ───────────────────────────────────────────────
alter table profiles add column if not exists deleted_at timestamptz;
comment on column profiles.deleted_at is
  'Set when the account was erased (self-service or by an admin); PII is stripped and login disabled.';

-- ── 2. NDPR-complete Privacy Policy ─────────────────────────────────────────
-- Overwrite the five seeded clauses in place…
update legal_clauses set title = 'Overview', body = $c$This Privacy Policy explains how laundriroom ("we", "us") collects, uses, shares and protects your personal data when you use our apps, websites and services. By using laundriroom you agree to this policy.

We process personal data in line with the Nigeria Data Protection Act 2023 and the Nigeria Data Protection Regulation (NDPR). Where we decide why and how your data is used, we act as the data controller.$c$
  where doc = 'privacy' and position = 1;

update legal_clauses set title = 'Information we collect', body = $c$Account details you give us such as your name, phone number and email address; the pickup and delivery addresses you save; and the details of the orders you place.

Usage and device information needed to run the service, and payment information processed securely by our payment partner — we do not store your full card details.$c$
  where doc = 'privacy' and position = 2;

update legal_clauses set title = 'How we use your information', body = $c$To create and manage your account, take and fulfil your laundry orders, arrange pickup and delivery, process payments and payouts, provide support, prevent fraud, meet our legal obligations, and send you order updates and service messages.

We rely on your consent for optional marketing messages, on performing our contract with you to run your orders, and on our legal obligations for records we are required to keep. You can withdraw consent for marketing at any time.$c$
  where doc = 'privacy' and position = 3;

update legal_clauses set title = 'Who we share your data with', body = $c$We share only the data needed to deliver the service: with the laundry (and its branch and riders) handling your order, and with the service providers who process data on our behalf under contract.

These providers include our cloud hosting and database provider (Supabase), our payment partners (Paystack and Flutterwave), our email provider (Resend), our messaging provider (the WhatsApp Business platform from Meta) and Google Maps for distance and delivery estimates. We do not sell your personal data.$c$
  where doc = 'privacy' and position = 4;

update legal_clauses set title = 'Where your data is stored and international transfers', body = $c$Your data is stored on secure cloud servers located in the European Union (Ireland). The European Union is recognised as providing an adequate level of data protection under the NDPR.

Some of our service providers may process limited data outside Nigeria. Where that happens we rely on an adequate-protection destination, your consent, or contractual safeguards with the provider, as permitted by the NDPR.$c$
  where doc = 'privacy' and position = 5;

-- …and add the new clauses (6–9) only if they aren't present yet.
insert into legal_clauses (doc, position, title, body)
select 'privacy', 6, 'How we keep your data safe', $c$We protect your data with appropriate technical and organisational measures. Data is encrypted in transit (HTTPS/TLS) and at rest, access is restricted on a need-to-know basis with role-based database security, and sensitive credentials are held in a protected secrets vault.

No system is perfectly secure, but we work to protect your data and to detect and respond to issues.$c$
where not exists (select 1 from legal_clauses where doc = 'privacy' and position = 6);

insert into legal_clauses (doc, position, title, body)
select 'privacy', 7, 'How long we keep your information', $c$We keep your personal data for as long as your account is active and you are using the service. Records of orders and payments are kept for longer where we are required to by law and for accounting and tax purposes.

When data is no longer needed, we delete it or anonymise it so it can no longer identify you.$c$
where not exists (select 1 from legal_clauses where doc = 'privacy' and position = 7);

insert into legal_clauses (doc, position, title, body)
select 'privacy', 8, 'Your rights under the NDPR', $c$Under the NDPR you have the right to access the personal data we hold about you, to correct it, to ask us to delete it, to object to or restrict certain processing, to withdraw consent, and to receive a copy of your data in a portable format.

You can do much of this yourself from your account: update your details, opt out of marketing emails, download a copy of your data, and delete your account. To make any other request, contact us using the details below. You also have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC).$c$
where not exists (select 1 from legal_clauses where doc = 'privacy' and position = 8);

insert into legal_clauses (doc, position, title, body)
select 'privacy', 9, 'Data Protection Officer and contact', $c$If you have any questions about this policy or how we handle your data, or you want to exercise your rights, contact our Data Protection Officer at dpo@laundriroom.app, or reach us at hello@laundriroom.app.

We aim to respond to your request within the timeframe required by the NDPR.$c$
where not exists (select 1 from legal_clauses where doc = 'privacy' and position = 9);
