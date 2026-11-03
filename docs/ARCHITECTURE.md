# Architecture

## One backend, three surfaces

```
   Customer app        Vendor dashboard       Admin dashboard
  (installable web)      (tablet-first)        (desktop-first)
        │                      │                      │
        └──────────────┬───────┴──────────┬───────────┘
                       │  Next.js (App Router, Server Components + Actions)
                       │  RLS-bound Supabase client (anon key + user JWT)
                       ▼
            ┌─────────────────────────────────────────┐
            │             Supabase (Postgres)          │
            │  order engine · pricing · stages · tags  │
            │  invoices · payments · payouts · ledger  │
            │  notification rules · integration config │
            │  Auth · Storage · Realtime · RLS         │
            └───────────────┬───────────────┬──────────┘
                            │               │
                    Edge functions     External services
             create-payment / webhook   Paystack (payments)
             send-notification          Resend / WhatsApp / SMS
```

## Why this shape

- **Rules live in the database.** Order IDs, price snapshots, stage→status
  transitions, payout scheduling and tag binding are triggers/functions, so the
  web app, the edge functions and any future native app all behave identically
  and can't skip a rule.
- **RLS is the security boundary.** The browser only ever holds the anon key.
  Every table has policies keyed on the user's role and vendor membership, so a
  customer sees only their orders and a vendor only its own — enforced by
  Postgres, not by app code.
- **The service-role key is server-only.** Webhooks and payout release use it to
  bypass RLS for trusted operations; it never reaches the client.
- **Notifications are event-driven.** App code only *announces* events
  (`order_confirmed`, `payment_received`, …). One rule row per event decides the
  channels, fallback order and recipients. Channels turn on when their provider
  is connected — which is why SMS can ship in Phase 1 and be switched on later
  with no release.

## Data flow: an order, end to end

1. Customer places an order → `orders` row; trigger assigns `ORD-YYMMDD-NNNN`
   and (for prepaid) a 4-digit handover code.
2. Attendant checks in items → `order_items`; triggers assign sub-IDs, snapshot
   the price, and recompute the order total; the `check_in` stage sets status.
3. Attendant presses stages → `stage_events`; `final_completion` marks the order
   `ready` and stamps `completed_at`.
4. Return leg → delivery (out for delivery) or collection.
5. Payment is always made in the app through Paystack (confirmed by webhook):
   up front, or "on delivery" — the customer taps Pay now in the app at the
   door. A succeeded pay-on-delivery payment closes the order; a prepaid order
   closes on the handover code. There is no cash path.
6. On close + paid (reconciled) → the payout is created due immediately
   (optional hold window: `platform_settings.payout_delay_hours`, default 0),
   net of commission, and the database calls `process-payouts` at once to send
   the Paystack transfer. The hourly job retries anything that couldn't go.
   Admins can Hold a payout, or Release it to send it now.

## Key files

| Concern | Where |
| --- | --- |
| Schema & logic | `supabase/migrations/0001–0006` |
| RLS policies | `supabase/migrations/0004_rls.sql` |
| Payout logic | `schedule_payout_if_ready()` in `0003` |
| Auth + role routing | `src/lib/auth.ts`, `src/middleware.ts` |
| Payments | `supabase/functions/create-payment`, `paystack-webhook` |
| Notifications | `supabase/functions/send-notification` |
| Theme tokens | `tailwind.config.ts`, `src/app/globals.css` |

## Indicative roadmap (from the build plan)

- **Phase 1 — Core platform:** orders, check-in, stages, tracking, invoices,
  the notification framework (email/WhatsApp/SMS built, SMS off until configured).
- **Phase 2 — Pilot launch:** online payments + payouts, WhatsApp live, plans,
  pay on delivery.
- **Phase 3 — Scale:** reports, ratings/promos, offline check-in.
- **Phase 4 — Growth:** native apps, customer subscriptions/wallet, accounting sync.

Weeks are indicative for an AI-assisted build with a human engineer reviewing
the money and security paths.
