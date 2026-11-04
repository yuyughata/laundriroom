# laundriroom — Laundry Service Platform

A two-sided laundry platform with three surfaces on one backend:

- **Customer app** — an installable web app (PWA): book a pickup or drop-off, track every item, pay online or on delivery.
- **Vendor dashboard** — tablet-first: order queue, item check-in with QR tags, processing stages, delivery/handover, item-type requests, ledger and payouts.
- **Admin dashboard** — desktop-first: vendor onboarding and verification, plans and delivery fees, payouts, notification rules, and an Integrations page for email/WhatsApp/SMS.

Built with **Next.js (App Router) + TypeScript + Tailwind** and **Supabase** (Postgres, Auth, Storage, Realtime). The visual language is "Ink & Ivory" — see `tailwind.config.ts`.

This repository is the full app and its database, ready to connect to a live Supabase project. Nothing is provisioned yet: follow **[docs/CONNECT-DATABASE.md](docs/CONNECT-DATABASE.md)** when you're ready and the whole thing comes online.

---

## What's in here

```
fresco-laundry/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/            sign in, sign up, email verify
│  │  ├─ customer/          customer PWA (order, track, pay, account)
│  │  ├─ vendor/            vendor dashboard (queue, order workspace, requests, ledger)
│  │  ├─ admin/             admin dashboard (vendors, plans, payouts, comms, integrations)
│  │  ├─ auth/callback/     Supabase email-verification callback
│  │  └─ api/health/        liveness + config probe
│  ├─ components/           shells (per surface) + shared UI
│  ├─ lib/
│  │  ├─ supabase/          browser / server / middleware clients
│  │  ├─ database.types.ts  schema types (regenerate with `npm run db:types`)
│  │  ├─ auth.ts            session + role guards
│  │  ├─ vendor.ts          vendor context for staff
│  │  └─ format.ts          money (₦), dates, status labels
│  └─ middleware.ts         session refresh + role routing
├─ supabase/
│  ├─ migrations/           0001–0006: schema, logic, RLS, defaults, storage
│  ├─ seed.sql              demo vendor, catalogue, tags (local dev only)
│  ├─ functions/            edge functions (payments + notifications)
│  └─ config.toml           local Supabase config
├─ scripts/                 env check + demo-role helper
└─ docs/                    CONNECT-DATABASE.md, ARCHITECTURE.md
```

## The database (the part you connect)

Six migrations build the whole model — 23 tables, all row-level-security protected, with the business rules enforced in the database so every client behaves the same:

- **Order IDs** `ORD-YYMMDD-NNNN` and item sub-IDs `…-01`, `…-02` generated automatically.
- **Price snapshots** — an item's price is copied onto the order at check-in; later price changes never alter past orders.
- **Stages** run in order and log who pressed each and when; the order status follows.
- **Closing** — a prepaid order closes on the handover code; a pay-on-delivery order closes when payment is confirmed.
- **Payouts** — sent automatically through Paystack Transfers as soon as an order is completed and paid (optional admin hold window), the vendor's own prices + delivery in full (commission is added to the customer's price, `0041`); admins can hold a disputed payout or release it to pay now.
- **Tags** bind to one open item at a time and free on close.
- **Notifications** — one rule per event decides channels (email/WhatsApp/SMS), fallback order and recipients. SMS is fully built and turns on once a provider is connected on the Integrations page.

Every table was validated against a real Postgres instance, including the full order→pay→payout flow and tenant isolation (a customer sees only their orders; a vendor only its own).

## Roles

`customer`, `attendant`, `vendor_manager`, `rider`, `platform_admin`, `support_agent`. Staff are tied to a vendor via `vendor_memberships`. Each role lands on its own dashboard.

---

## Quickstart (once you have a Supabase project)

```bash
npm install
cp .env.example .env.local        # fill in your Supabase URL + anon key
npm run setup                     # checks the env is ready
# apply the database (see docs/CONNECT-DATABASE.md for the Supabase CLI steps)
npm run dev                       # http://localhost:3000
```

Full, step-by-step connection instructions — creating the project, applying migrations, seeding, creating the first admin, deploying the edge functions, and wiring Paystack — are in **[docs/CONNECT-DATABASE.md](docs/CONNECT-DATABASE.md)**.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run setup` | Verify required env vars |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:reset` | Reset the local DB and re-run migrations + seed |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the live schema |

## What is finished vs. stubbed

**Finished and working end to end:** auth + role routing, the full database (schema, logic, RLS, defaults), customer ordering/tracking/pay, vendor check-in/stages/handover/requests/ledger, admin vendors/plans/payouts/communications/integrations, and the automatic payout scheduling.

**Stubbed, ready to wire with keys:**
- **Payments** — `supabase/functions/create-payment` and `paystack-webhook` are written for Paystack; add `PAYSTACK_SECRET_KEY`. Without it, the dev "Pay now" path simulates a successful payment (using the service-role key) so the flow can be exercised.
- **Messaging** — `supabase/functions/send-notification` has the event→rule→channel engine and a working Resend email adapter; the WhatsApp and SMS adapters are marked where to drop your provider in. The framework and admin controls are complete.

## Security notes

- Row-level security is on for every table; the browser only ever uses the anon key.
- The service-role key is used only in server code / edge functions and is never exposed to the client.
- Integration API keys are stored server-side (encrypted) and shown masked; payment keys live in edge-function secrets, not in the database.
- Secrets never belong in the repo — `.env*.local` is git-ignored. Use `.env.example` as the template.

> This is AI-assisted scaffolding. Have a human engineer review the payment, payout, and access-control paths before taking real payments.

## License

Private / all rights reserved (placeholder — set as you prefer).
