# Connecting the database and going live

Follow this when you're ready to point laundriroom at a real Supabase project. You
can do the whole thing from the Supabase dashboard (no CLI) or with the Supabase
CLI — both routes are below.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> → **New project**. Pick a name (e.g. `fresco`),
   a strong database password, and a region close to your users
   (e.g. `West EU (London)` for Lagos traffic is a reasonable start).
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server only — keep secret)

## 2. Set the app environment

```bash
cp .env.example .env.local
```

Fill in the three values above, plus `NEXT_PUBLIC_SITE_URL` (your app URL).
Then confirm:

```bash
npm install
npm run setup     # should print "Ready."
```

## 3. Apply the database

### Option A — Supabase dashboard (no CLI)

Open **SQL Editor** and run each file in `supabase/migrations/` **in order**
(0001 onward, in number order), then `supabase/seed.sql` if you want demo data. Paste the
contents of each file and run it.

### Option B — Supabase CLI (recommended)

```bash
# one-time: install the CLI → https://supabase.com/docs/guides/cli
supabase link --project-ref <your-project-ref>   # ref is in your project URL
supabase db push                                  # applies supabase/migrations in order
# optional demo data:
psql "$(supabase db url)" -f supabase/seed.sql
```

After this you have every table, all RLS policies, the default commission plan,
the global item catalogue, notification rules + templates, and the three
integration rows (all "not configured").

## 4. Configure Auth

In **Authentication → URL Configuration**:

- **Site URL:** your app URL (e.g. `http://localhost:3000` for dev).
- **Redirect URLs:** add `<app-url>/auth/callback`.

In **Authentication → Providers → Email**: keep email enabled. "Confirm email"
on is fine — customers can order before confirming; the app shows a verify
banner and reminders chase unverified emails.

## 5. Create your first admin

Sign up through the app (`/signup`) with your admin email, then promote it.
In the SQL Editor:

```sql
update profiles set role = 'platform_admin', email_verified = true
where email = 'you@yourdomain.com';
```

Sign out and back in — you'll land on the admin dashboard.

### Demo staff (optional)

Create `manager@…`, `attendant@…`, `admin@…` via `/signup`, then run
`scripts/seed-demo-roles.sql` (edit the emails first) to assign roles and attach
the manager/attendant to the demo vendor from `seed.sql`.

## 6. Storage

The migrations create three private buckets: `item-photos`, `vendor-docs`,
`invoices`, with access policies. Nothing more to do unless you want public
buckets.

## 7. Payments (Paystack)

1. Get your keys from the Paystack dashboard (test keys to start).
2. Set them as **edge-function secrets**:

   ```bash
   supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx
   supabase functions deploy create-payment
   supabase functions deploy paystack-webhook --no-verify-jwt
   ```
3. In the Paystack dashboard, set the **webhook URL** to your deployed
   `paystack-webhook` function URL.
4. In the app, set `PAYSTACK_SECRET_KEY` in the server env too (so the
   "Pay now" action hands off to Paystack instead of the dev simulator).

**Without Paystack keys** the "Pay now" button still works in development: it
records a succeeded payment using the service-role key so you can watch the
order close and the payout get scheduled.

## 8. Notifications (Resend / WhatsApp / SMS)

1. Deploy the function: `supabase functions deploy send-notification`.
2. For email, set `RESEND_API_KEY` as a function secret and add your sender
   domain in Resend.
3. In the app: **Admin → Integrations**, connect each provider. Status flips to
   "Connected"; SMS then appears as a channel on **Admin → Communications**.
4. WhatsApp and SMS adapters are stubbed in `send-notification/index.ts` — drop
   in your provider calls where marked.

## 9. Deploy the app

Any Node host works; Vercel is the simplest for Next.js:

1. Push this repo to GitHub (already done if you're reading this there).
2. Import it in Vercel, set the same env vars (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_SITE_URL`, and payment/notification keys as needed).
3. Deploy. Update Supabase Auth **Site URL / Redirect URLs** to the production
   domain.

---

## Regenerating types after a schema change

If you change the schema, regenerate the TypeScript types so the app stays in
sync:

```bash
npm run db:types     # supabase gen types typescript --local > src/lib/database.types.ts
```

## Troubleshooting

- **"Ready." won't print** — the two `NEXT_PUBLIC_SUPABASE_*` vars aren't set in
  `.env.local`.
- **Everything redirects to /login** — the session isn't being read; check the
  Site URL / Redirect URLs and that cookies aren't blocked.
- **A query returns nothing for a logged-in user** — that's RLS doing its job;
  confirm the user's role and (for staff) their `vendor_memberships` row.
- **Payout didn't appear** — a payout is scheduled only when an order is
  `closed` *and* a payment is `succeeded`. Check both.

---

## Automated vendor payouts (Paystack Transfers)

A payout row is created 24h after an order is `closed` and paid, with its `net`
(gross − commission) ready to send. To pay vendors automatically:

**1. Activate Transfers on Paystack.** Complete business verification, then
enable Transfers in the dashboard. Collections and transfers share one balance —
customers' online payments fund the vendor transfers, and you keep the
commission as the difference. Keep the balance funded.

**2. Disable transfer OTP** so transfers go through programmatically: in the
dashboard (Settings → Preferences → disable "OTP for transfers"), or via the API
(`POST /transfer/disable_otp` then confirm once with the OTP).

**3. Deploy the functions and set secrets:**
```bash
supabase functions deploy process-payouts
supabase functions deploy paystack-webhook --no-verify-jwt
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxx
supabase secrets set CRON_SECRET=$(openssl rand -hex 16)   # protects process-payouts
```

**4. Point the Paystack webhook** (dashboard → Settings → API Keys & Webhooks)
at the `paystack-webhook` URL. It already handles `charge.success`; it now also
settles `transfer.success` / `transfer.failed` / `transfer.reversed` onto the
payout (success → `sent`; failed/reversed → back to `due` with a reason).

**5. Schedule `process-payouts` hourly** with `pg_cron` + `pg_net` (enable both
extensions in the dashboard), replacing the URL, service-role key and
`CRON_SECRET`:
```sql
select cron.schedule(
  'process-payouts-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.functions.supabase.co/process-payouts',
    headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
```

Each run transfers every `due` payout whose `due_at` has passed: it creates the
Paystack recipient from the vendor's saved bank account on first use, checks the
balance, initiates the transfer (reference = payout id, so no double-pay), and
moves the payout to `processing`. The webhook then settles it. Payouts with no
vendor bank account, or when the balance is short, stay `due` with a
`failure_reason` and retry next run. Vendors set their bank account under
**Vendor → Ledger → Payout account**; admins see unpayable payouts flagged on
**Admin → Payouts**.

Test with Paystack **test keys** first — test transfers simulate the full
`processing → transfer.success` path without moving real money.
