# UI screens

Screenshots of every screen in the app, by role, captured on 2026-11-04 from
the current build with demo data (no real customers or vendors). Each PDF
starts with an index of its screens; each page shows the screen's route.

| PDF | What's in it | Screens |
|---|---|---|
| [laundriroom-ui-customer.pdf](laundriroom-ui-customer.pdf) | Public pages (landing, sign-in, `/apply`, vendor profile pages) and the customer app on a phone | 23 |
| [laundriroom-ui-vendor.pdf](laundriroom-ui-vendor.pdf) | Vendor dashboard on a tablet: manager screens, the attendant's view, and a printed tag sheet | 21 |
| [laundriroom-ui-admin.pdf](laundriroom-ui-admin.pdf) | Admin dashboard on desktop, plus every email template | 42 |
| [laundriroom-ui-whats-new.pdf](laundriroom-ui-whats-new.pdf) | Only the screens changed in this round, marked NEW or UPDATED | 14 |

**What changed in this round:** the commission is added on top of the
vendor's prices, and on an express order the express charge replaces it
(migrations `0041`/`0042`). That changes the public price list, the
customer's order pages, the vendor order page (vendor and customer prices,
"You receive" for managers only), the Ledger, Admin → Fees & charges and the
payout pages.

The demo data uses a 15% commission, 20% express and 15% premium.
