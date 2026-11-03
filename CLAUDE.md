# CLAUDE.md — orientation for Claude Code

This file gives Claude Code (and any contributor) the context to continue this
project. Read `README.md` and `docs/ARCHITECTURE.md` for the full picture.

## What this is

**laundriroom** — a two-sided laundry platform. Three surfaces on one backend:
customer PWA, vendor dashboard (tablet-first), admin dashboard (desktop-first).

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Supabase
(Postgres, Auth, Storage, Realtime). Theme: "Ink & Ivory" (`tailwind.config.ts`).

## How to run

```bash
npm install
cp .env.example .env.local          # fill in Supabase URL + anon key
npm run dev                         # http://localhost:3000
npm run typecheck                   # must stay clean
npm run build                       # must stay green
```

To connect a live database, follow `docs/CONNECT-DATABASE.md` end to end
(create Supabase project → apply `supabase/migrations` in order → seed →
promote an admin → deploy edge functions → wire Paystack).

## Conventions (please keep)

- **Business rules live in the database.** ID generation, price snapshots,
  stage→status transitions, payout scheduling and tag lifecycle are Postgres
  triggers/functions in `supabase/migrations/0003`. Add rules there, not only in
  the app, so every client behaves the same.
- **RLS is the security boundary.** Every table has policies
  (`0004_rls.sql`). The browser only uses the anon key. Never expose the
  service-role key to client code; use it only in server actions / edge
  functions (`src/lib/supabase/server.ts → createServiceClient`).
  Sign-up always creates a `customer` (role metadata is ignored) and only a
  platform admin can change a profile's role/status/verification columns
  (`0018`, `guard_profile_columns`). Views must either use
  `security_invoker = true` or filter their own rows (`order_summaries`), and
  new SECURITY DEFINER functions should `revoke execute ... from anon` unless
  they're meant to be public.
- **Schema changes:** add a new migration file (don't edit applied ones once the
  DB is live), then `npm run db:types` to regenerate `src/lib/database.types.ts`.
  Those entity types are `type` aliases (not `interface`) on purpose — Supabase's
  generics need the implicit index signature.
- **Money is NGN**, formatted via `src/lib/format.ts`. **Commission is the only
  revenue model** — charged on the whole order total (delivery fee included).
  Subscription/combined plans are retired (migration `0015`): any such plans are
  deactivated and their vendors moved to the default commission plan, and the
  admin Plans & fees UI only offers commission. The `plan_type` enum still holds
  the old values for history, but nothing creates them.
- **Three orthogonal order dimensions:** service *kind* per item
  (`service_type`: wash & fold / dry clean / press), quality *tier* per order
  (`service_tier`: standard / premium — premium unlocks admin-defined
  `service_extras`), and *turnaround* per order (`turnaround`: normal / express,
  with admin percentages in `platform_settings`). Order total =
  items + extras + delivery + express markup + premium markup + any reschedule
  penalty, all recomputed by DB triggers.
- **Who earns what:** standard orders stay at the vendor's price (platform earns
  via the commission, a vendor-funded discount). Express/premium markups are
  percentages kept 100% by the platform — they are excluded from the vendor
  payout (`schedule_payout_if_ready` pays on items+extras+delivery only). A
  non-collection penalty (% of delivery fee, admin-set) is added on reschedule
  when the customer was at fault (`apply_delivery_reschedule`). Everything
  lives on one page, Admin → Fees & charges (the old Plans & fees tab redirects
  there): one global set of rates for every vendor — commission (stored on the
  default plan; `schedule_payout_if_ready` always uses it, `0022`), express %
  and premium % (`platform_settings`) — plus delivery fee, penalty and
  referral reward. There are deliberately no per-vendor rates. Vendors can't
  change their own status/plan/KYC flag (`guard_vendor_columns`).
- Server Components fetch; interactive bits are small client components calling
  server actions in each area's `actions.ts`.
- **Multi-branch vendors (`0033`):** a vendor is the business (name, KYC,
  commission, one shared price list, one payout account, one `/v/<slug>`
  link); `branches` are its shop locations (address, hours, open switch). Every
  vendor gets a main branch on creation (trigger), mirrored onto the vendor row
  so older code keeps working. `orders.branch_id` is set on insert (chosen →
  staff's own branch → main) and must be active. `vendor_memberships.branch_id`
  NULL = business-wide; set = that branch only — staff see only their branch's
  orders (`can_staff_branch` in orders RLS, `order_summaries`, `confirm_pickup`,
  `apply_delivery_reschedule`; child tables follow via orders RLS).
  `is_vendor_manager()` means a **business-wide** manager: only they (and
  platform admins, at Admin → Vendors → a vendor) add/edit branches and move
  staff (`src/lib/branchActions.ts`, `components/branches/BranchManager.tsx`,
  Vendor → Branches). Customers pick a branch when ordering; the public page
  lists branches with per-branch order links (`?branch=`); the queue has a
  branch filter for business-wide staff; ledger has income by branch; vendor
  new-order alerts go to that branch's staff + business-wide staff.
- **Delivery pricing (`0035`):** Admin → Fees & charges → Delivery pricing:
  flat fee, or by distance (`GOOGLE_MAPS_API_KEY`, server-side only,
  `src/lib/maps.ts`): base + per-km × driving km (Distance Matrix) from the
  branch to the customer's address, at least the minimum, rounded up to ₦50
  (`src/lib/deliveryPricing.ts`). Any failure (no key, address not found) falls
  back to the flat fee. The server prices the order at creation
  (`orders.delivery_fee`, `delivery_distance_km`); the form shows a live quote
  (`quoteDeliveryFee`). Pickup/delivery orders now take an address
  (`customer_addresses`, geocoded on save; `orders.pickup_address_id` is the
  customer's address for both legs).
- **Partner Agreement (`0034`):** the terms vendors accept (`/apply`, Vendor →
  Verification) are `agreement_clauses`, edited at Admin → Partner agreement
  (add, edit, reorder, hide, delete). Any change bumps
  `platform_settings.agreement_updated_at`; vendors who accepted earlier are
  asked to accept again. More than 3 paragraphs → scrollable box
  (`components/ui/AgreementText.tsx`). `src/lib/legal.ts` holds the title and
  the fallback clause.
- **Password fields** use `components/ui/PasswordInput.tsx` (Show/Hide).
- **Responsive dashboards:** admin and vendor shells share `ShellNav` — a fixed
  sidebar on desktop (lg+), a top bar with a Menu button (all links + account)
  below that. Wrap data tables in `table-scroll` (globals.css): it scrolls
  sideways with edge shadows and keeps a readable min-width below lg. Page
  heading rows use `flex flex-wrap … gap-3` so badges/buttons wrap on phones.

## State of the build

**Working end to end:** auth + role routing (6 roles), the full database
(validated against Postgres, including order→pay→payout and RLS isolation),
customer order/track/pay, vendor check-in/stages/handover/requests/ledger,
admin **dashboard home (live platform totals)**, **orders overview across all
vendors**, **user management** (edit role/status, attach staff to a vendor,
delete, message by email/WhatsApp), vendors/plans/payouts/communications/
integrations, **support & complaints** (customer tickets with predefined
categories/subcategories + "Other", threaded replies; support agents handle
them under Admin → Support), **claims & lost items** (customer raises damage/loss
on an order/item; admins resolve under Admin → Claims using item-level evidence —
check-in photos + condition notes), **check-in evidence** (attendant adds photos
+ condition notes per item at check-in), **analytics** (Admin → Analytics:
revenue, avg turnaround, top items, repeat rate via `get_analytics()`),
**promo codes** (admin platform-funded at Admin → Promos, or vendor-funded at
Vendor → Promos; `redeem_promo` snapshots the discount, scopes vendor codes to
that vendor, and `schedule_payout_if_ready` deducts a vendor-funded discount
from the vendor's gross while a platform discount leaves it whole) and
**referrals** (per-customer `referral_code`; a first completed
order by a referee auto-issues an owner-scoped reward promo to the referrer),
dispatch-partner logging (`dispatch_reference`), **rider assignment**
(vendor/attendant assigns a rider — own or dispatch — on the order workspace via
`assignRider`, storing `rider_name`/`rider_phone`; the rider is shown the order
code + handover PIN to carry, and the vendor manages delivery status in-app, so
riders need no login), **QR camera scanning** (`QrScanner` + `html5-qrcode`:
attendants scan a tag's QR into the check-in form instead of typing it),
**vendor self-serve applications** (public `/apply` form inserts into
`vendor_applications` under anon RLS; admins review at Admin → Applications and
approve to auto-create a pending vendor), **platform-funded bulk discount**
(Admin → Promos: set a qualifying item count + %; `recompute_order` takes it off
the items subtotal of any order that reaches the threshold, snapshotted to
`orders.bulk_discount`; it's platform-funded so `schedule_payout_if_ready` never
deducts it from the vendor gross), **vendor KYC verification** (post-onboarding,
non-blocking: vendors upload ID + CAC to the private `vendor-docs` bucket at
Vendor → Verification; admins review and mark `vendors.kyc_verified` at
Admin → Verification), **leakage analytics** (Admin → Leakage:
`get_leakage_analytics()` surfaces per-vendor disintermediation signals —
one-and-done customer rate and lapsed-repeat customers, i.e. customers who
engaged then went quiet >45 days — to flag vendors who may be taking
platform-introduced customers off-app), **non-circumvention agreement** (shared
clause in `src/lib/legal.ts`, accepted at `/apply` with a required checkbox —
stored on `vendor_applications.agreed_terms/agreed_at` — and acknowledged in-app
by the vendor manager at Vendor → Verification, stored on
`vendors.terms_accepted_at`; admins see acceptance beside KYC), **customer reviews & ratings** (1–5 stars + comment
on a completed order; aggregated per vendor via the `vendor_ratings` view and
shown on vendor selection, the vendor Reviews page, and admin — admins moderate
under Admin → Reviews), automatic instant payouts (see Automated payouts below), and tag release
on order close, and **vendor profile pages** (public `/v/<slug>`, `0031`):
every vendor gets a `slug` from its name the moment the row is created
(trigger `set_vendor_slug`; unique with -2/-3; kept on rename; admin-only to
change via `guard_vendor_columns`). Anyone — signed in or not — can open the
page; it reads `get_vendor_profile(slug)` (SECURITY DEFINER, granted to anon,
verified/pending vendors only) for name, location, hours, the KYC
"Verified business" badge, rating summary + recent reviews (first name +
initial) and the price list, with Open Graph tags for WhatsApp previews. Its
Order button goes to `/customer/order?vendor=<slug>` (signed-out visitors via
`/signup?next=…` / `/login?next=…` — `safeNext` in `src/lib/nav.ts` keeps
return paths same-site); that pre-selects the vendor and sets
`orders.via_vendor_link`. Vendors copy/share the link, send it on WhatsApp and
download a QR code at Vendor → My page (with orders-from-link stats); admins
see each link under Admin → Vendors. Links use `NEXT_PUBLIC_SITE_URL`.

**Stubbed, ready for keys:**
- Payments — `create-payment` picks the provider from
  `platform_settings.payment_provider` (Admin → Integrations): Paystack
  (`paystack-webhook`, `PAYSTACK_SECRET_KEY`) or Flutterwave
  (`flutterwave-webhook`, `FLUTTERWAVE_SECRET_KEY` + `FLUTTERWAVE_WEBHOOK_HASH`).
  Pay-on-delivery is optional per order. Dev path simulates a paid order via the
  service key. Handover PINs: a pickup PIN (rider collects) and a handover PIN
  (delivery/collection) are generated per order (`0010`, `confirm_pickup`).
- Automated payouts (Paystack Transfers) — a vendor sets their bank account at
  Vendor → Ledger → Payout account (`vendor_payout_accounts`, name resolved via
  Paystack `/bank/resolve`). Pay-on-delivery is paid in the app too (Pay now at
  the door), so every completed order's money is in the Paystack balance.
  Payouts are paid **immediately on reconciliation** (`0032`):
  `schedule_payout_if_ready` makes the payout due at completion + the admin
  hold window (`platform_settings.payout_delay_hours`, default 0, set on
  Admin → Fees & charges), and the `payouts_pay_when_due` trigger calls
  `process-payouts` for that payout via `request_payout_run` (pg_net + the
  Vault secrets). The hourly cron (`0019`) is the retry/hold-window sweep.
  Admin → Payouts **Release** (platform_admin only) calls `process-payouts`
  with `{payout_id, release: true}` + the service key to transfer a due or
  held payout now; without a Paystack key it only simulates in dev /
  `ALLOW_SIMULATED_PAYMENTS`. The function claims each payout (due/held →
  `processing`, so it's never sent twice), lazily creates the Paystack transfer
  recipient, checks balance, initiates the transfer (reference = payout id,
  idempotent); anything that blocks it puts the payout back to `due` with a
  `failure_reason`. The
  `paystack-webhook` settles `transfer.success` → `sent` and
  `transfer.failed`/`reversed` → back to `due` with a `failure_reason`. Needs
  Transfers enabled + OTP disabled on Paystack; test keys simulate the full path.
- Messaging — `supabase/functions/send-notification` has the event→rule→channel
  engine with working Resend email and WhatsApp Cloud API adapters (SMS is
  marked `not implemented`). Payload `{ event, order_id | user_id | ticket_id }`;
  rule recipient `admin` = every active platform_admin + support_agent,
  `vendor` = the order's vendor's active managers + attendants, `customer` =
  the order's/ticket's customer (email, and `profiles.phone` for WhatsApp).
  New orders alert admins + the vendor (`order_placed`, `0027`/`0028`) and send
  the customer `order_confirmed`, both fired from `customer/actions.ts →
  createOrder` via `notifyOrder`; order details are read from the DB.
  **Vendors can also create orders** for walk-in/phone customers at
  Vendor → Queue → New order (`vendor/actions.ts → createVendorOrder`): staff
  find the customer with `find_customer_for_vendor` (exact phone/email, staff
  only, `0030`) or add them (invite email when an email is given, else a
  phone-only account via the service key). `orders.created_by` is set by a
  trigger; vendor-entered orders notify the customer + admins only
  (`skip_recipients: ['vendor']`) and the alert shows who entered it. Support tickets alert admins:
  `ticket_opened` / `ticket_message` (`0023`/`0024`) fired from
  `customer/support/actions.ts` via `notifyTicket`; support replies notify the
  customer by email + WhatsApp (`ticket_reply`, `0025`/`0026`, fired from
  `admin/support/actions.ts → replyTicket`). Ticket details are read from the
  DB, not trusted from the caller. WhatsApp needs the
  `WHATSAPP_API_TOKEN` secret, the phone number ID and an approved template
  (one body variable `{{1}}`) set on Admin → Integrations. Email uses designed Ink &
  Ivory HTML templates in `src/lib/emails.ts` (one per event), mirrored to
  `supabase/functions/_shared/emails.ts` (keep both in sync). Every email header
  shows the brand icon + wordmark; the icon is `public/brand/mark-email.png`,
  loaded from `SITE_URL` (edge function) or `{{ .SiteURL }}` (auth templates).
  Branding everywhere is icon + wordmark: `components/ui/Logo.tsx` in the app
  shells, `src/lib/brandMark.ts` (embedded PNG) in PDF reports. Admins preview
  all templates at `/api/emails/preview`. Account emails (password changed,
  details updated, suspended, reactivated) are sent by the app via
  `src/lib/notify.ts → send-notification` with `user_id`. Sign-in emails that
  carry Supabase's one-time links (confirm sign-up, reset password, magic
  link, change email, invite, reauthentication) are Supabase Auth templates in
  the same design: `AUTH_EMAIL_TEMPLATES` in `emails.ts` → `npm run
  emails:auth` → `supabase/templates/*.html` (wired in `config.toml`; paste into
  the dashboard for the hosted project). Password screens: `/forgot-password`,
  `/reset-password`, `/account/password` (all roles).

## Good next tasks

- Implement the SMS adapter in `send-notification`.
- Call `send-notification` on the remaining order events (checked in, ready,
  out for delivery, payment received, closed) — order_placed/confirmed are wired.
- Invoice PDF generation + the `invoices` storage bucket.
- Item photo capture on check-in (bucket + policies already exist).
- Email the applicant on approve/reject, and the admin on a new application
  (wire `send-notification` with new events).
- Rider-facing notifications (SMS the assigned rider the code) once the SMS
  adapter lands.
- Tests: a Postgres test harness already proved the triggers; formalise it.

## Attribution for commits

```
Co-Authored-By: Claude <noreply@anthropic.com>
```
