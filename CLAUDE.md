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
- **Launch city: Jos.** Demo data, form defaults (city "Jos") and examples
  use Jos areas (the demo laundry is Fold & Press, Rayfield —
  `/v/fold-and-press-rayfield`, tag prefix FPR). Times use `Africa/Lagos`,
  which is simply Nigerian time (WAT).
- **Money is NGN**, formatted via `src/lib/format.ts`. **Commission is the only
  revenue model** — since `0041` it is **added on top of the vendor's item
  prices** for the customer (₦200 shirt at 30% → customer pays ₦260, vendor
  receives ₦200), not deducted from the payout. **Express replaces the
  commission** (`0042`): the commission is charged on the normal turnaround;
  an express order adds the express % instead (₦200, 30% / 20% express /
  12.5% premium → normal 260, normal+premium 285, express 240,
  express+premium 265). Not added to delivery, premium
  extras (admin-priced) or the penalty.
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
- **Who earns what (`0041`/`0042`):** `orders.commission_markup` is the rate
  added to item prices — the global commission on a normal order, 0 on an
  express order — set on insert by trigger and only changed by a turnaround
  change (`orders_reprice_on_turnaround` then re-prices the items).
  `order_items.price_at_checkin` stays the **vendor's** price;
  `order_items.customer_price` = price × (1 + rate), rounded to the whole naira
  (`src/lib/pricing.ts` mirrors it). `orders.items_total` is the customer's
  item sum, `vendor_items_total` the vendor's, `commission_total` the gap.
  Express/premium markups are % of the **vendor's** price (items + extras),
  kept 100% by the platform. A vendor-funded promo costs the vendor only its
  share (vendor subtotal ÷ customer subtotal); the bulk discount is
  platform-funded. `orders.vendor_earnings` (also on `order_summaries`) is what
  the vendor receives: vendor prices + extras + delivery − its promo share;
  `schedule_payout_if_ready` pays exactly that with `fee = 0`. Orders with
  `commission_markup` NULL (placed before 0041) keep the old rules: customer
  pays the vendor price and the commission is deducted as the payout `fee`.
  The public page (`get_vendor_profile`) shows customer prices; the vendor
  order page shows both prices and, for business-wide managers, "You receive". A
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
  platform admins, at Admin → Vendors → a vendor) add/edit branches (staff
  are placed at a branch from Team) (`src/lib/branchActions.ts`, `components/branches/BranchManager.tsx`,
  Vendor → Branches). Customers pick a branch when ordering; the public page
  lists branches with per-branch order links (`?branch=`); the queue has a
  branch filter for business-wide staff; ledger has income by branch; vendor
  new-order alerts go to that branch's staff + business-wide staff.
- **Trip pricing — pickup & delivery (`0035`/`0047`):** Admin → Fees & charges →
  Delivery pricing sets one fee for a trip between the branch and the
  customer's address: flat, or by distance (`GOOGLE_MAPS_API_KEY`,
  server-side only, `src/lib/maps.ts`): base + per-km × driving km (Routes API
  computeRoutes), at least the minimum, rounded up to ₦50
  (`src/lib/deliveryPricing.ts`). Any failure (no key, address not found) falls
  back to the flat fee. **Pickup ("Pick up from me") and delivery ("Deliver to
  me") each cost one such trip** — an order that is both picked up and
  delivered pays both (`0047`). The server prices each leg at creation from the
  same address (`orders.delivery_fee`/`delivery_distance_km`,
  `orders.pickup_fee`/`pickup_distance_km`); the order form shows a live quote
  per chosen leg (`quoteDeliveryFee`, one quote serves both). `recompute_order`
  is the single place the total is worked out, so both fees are added to what
  the customer pays and kept by the vendor (its rider makes each trip) — total,
  `vendor_earnings` and the payout all include them. The non-collection penalty
  stays a % of `delivery_fee` only. Pickup/delivery orders take an address
  (`customer_addresses`, geocoded on save; `orders.pickup_address_id` is the
  customer's address for both legs).
  **Who keeps the delivery fee (`0048`):** the customer always pays it, but who
  keeps it follows `orders.delivered_by` — `own_rider` (or unset) → the vendor
  keeps it; `dispatch_partner` → the platform keeps it and settles the dispatch
  company out of band. Pickup is always the vendor's own rider, so the pickup
  fee always goes to the vendor. `delivered_by` follows the vendor's rider
  choice: `assign_order_rider` sets it from the assigned rider's kind on a
  delivery order and re-prices (`recompute_order`), so the delivery fee is in
  `vendor_earnings`/the payout only for own-rider deliveries; the vendor order
  page says so in "You receive".
- **Wash & dry only (bulk) (`0049`):** the full service is wash, dry, press &
  fold; this adds an optional flat-rate "wash & dry only" service for bulk
  family loads. Admin → Services & extras sets one platform price
  (`platform_settings.wash_dry_price` — the base the laundry receives; 0 = the
  offering is off) and the qualifying clothes count (`wash_dry_min_items`). A
  vendor opts in on Vendor → My page (`vendors.offers_wash_dry`, manager only).
  A customer who picks it (shown only when the chosen laundry offers it) places
  a flat-priced order (`orders.wash_dry`, `orders.wash_dry_price` snapshots the
  base); the customer pays base + commission (0041 model), the vendor keeps the
  base; standard tier only (no premium extras); express still allowed; trips
  added as usual. `recompute_order` prices a wash-&-dry order from the flat base
  instead of the per-item sum (items still tagged for tracking, prices ignored).
  A new after-insert reprice (`orders_reprice_on_insert` → `reprice_new_order`)
  gives every order its price straight away — essential here (priced before any
  check-in) and it also makes a pickup-only order show its pickup fee at once.
- **Partner Agreement (`0034`):** the terms vendors accept (`/apply`, Vendor →
  Verification) are `agreement_clauses`, edited at Admin → Partner agreement
  (add, edit, reorder, hide, delete). Any change bumps
  `platform_settings.agreement_updated_at`; vendors who accepted earlier are
  asked to accept again. More than 3 paragraphs → scrollable box
  (`components/ui/AgreementText.tsx`). `src/lib/legal.ts` holds the title and
  the fallback clause.
- **Printable tags (`0036`):** Vendor → Tags and Admin → Tags (per vendor).
  `generate_tags(vendor, count)` (business-wide manager or platform admin,
  1–500) makes a `tag_batches` row + `free` tags coded `PREFIX-NNNN`
  (e.g. `FPL-0042`; grows past 9999). `vendors.tag_prefix` is set
  automatically when the vendor is created (trigger `set_vendor_tag_prefix`:
  name initials, or a one-word name's first 3 letters —
  `vendor_tag_prefix_base`), unique across vendors (FPL, FPL2, FPL3…), kept on
  rename, and only an admin can change it (`guard_vendor_columns`). Numbers
  come from `vendors.tag_seq` under a row lock and are never reused; a number
  whose code already exists is skipped. `/api/tags/pdf?batch=|ids=[&only=missing,damaged][&reprint=1]`
  `&size=20|25|30` (square tags in mm, default 25; picker remembered per
  device, `src/lib/tagSizes.ts`) renders A4 sheets (`src/lib/tagPdf.ts`:
  tags edge to edge with shared dashed cut lines, punch mark on the left,
  QR = the code, code in Courier — on two lines at 2 cm — and a 5 cm ruler
  to check the print wasn't scaled). Each QR's mask is picked so zxing (the
  decoder in html5-qrcode) reads it (`src/lib/qrScannable.ts`; ~1 in 5 small
  codes otherwise can't be read by it); the scanner also uses the phone's
  native BarcodeDetector when present. The route counts prints; a
  reprint puts missing/damaged tags back in service. Staff mark tags
  `missing`/`damaged`/found (`src/lib/tagActions.ts`); closing an order only
  frees `in_use` tags. UI: `components/tags/TagManager.tsx`.
- **Bad reviews (`0037`/`0038`):** a 1–2★ review fires `review_low` (vendor
  staff for that branch + business-wide, and admins) from `submitReview`.
  Admin → Vendor quality reads `get_review_watchlist()` (flagged: 3+ bad in
  30 days, or 2+ and rising vs the previous 30, or 30%+ of 5+ reviews; watch:
  any bad in 30 days) and escalates in order inquiry → warning → suspension
  (`vendor_quality_actions`, `admin/quality/actions.ts`; suspension sets the
  vendor suspended; `resolved` closes a case). Each step emails/WhatsApps the
  business-wide managers (`vendor_inquiry`/`vendor_warning`/
  `vendor_suspended`, payload `vendor_action_id`); they reply at
  Vendor → Reviews (`respond_quality_action`).
- **Live database:** migrations 0001–0049 are applied to the hosted project
  (0033–0038 on 2026-11-03, 0039–0045 on 2026-11-04, via the Supabase MCP `execute_sql`, versions
  recorded in `supabase_migrations.schema_migrations`). The MCP asks for an
  approval this cloud session can't show whenever SQL contains `drop …`
  statements, so live changes went in drop-free (`create or replace trigger`,
  `alter policy`) — same end state as the migration files.
  `supabase/manual/apply-0033-0038.sql` is the SQL Editor fallback (two
  transactions, self-checks, re-runnable).
- **Team (staff management):** Vendor → Team (business-wide manager only) and
  Admin → Vendors → a vendor (platform admin, on the vendor's behalf) use
  `components/team/TeamManager.tsx` + `src/lib/teamActions.ts`: invite by
  email (Supabase invite → the person sets their own password at
  `/reset-password`, then signs in at `/login`), set role (Manager /
  Attendant) and branch, send a login link (password-reset email), remove
  (membership deleted, account back to `customer`). An email that already
  has an account is attached (a customer account becomes staff); laundriroom
  admin/support emails and people at another vendor are refused; the last
  main manager can't be demoted or removed; you can't change yourself.
  Actions run with the service key after an explicit permission check and
  are written to `audit_log`. `loadTeam` (`src/lib/teamData.ts`) shows sign-in
  status ("Invite sent" until first sign-in). Branches page no longer moves
  staff. Needs `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL`.
- **Money is manager-only (`0040`):** ledger, payouts and the payout account
  are readable only by `is_vendor_manager` (business-wide) + admins; Ledger
  and Team are hidden from attendants/riders/branch managers (`VendorShell`
  `isManager`), the Ledger page refuses them, and the statement / payouts /
  transactions PDFs return 403 for them (`canSeeVendorFinances`).
- **Staff attribution (`0039`):** staff sign in with their own accounts (no
  name dropdown), so the DB records who acted: `order_items.checked_in_by`
  (default `auth.uid()`), `orders.picked_up_by` (set by `confirm_pickup`),
  `stage_events.pressed_by` (stages, out for delivery, handover) and
  `orders.created_by`. `get_order_activity(order)` (staff of that branch +
  admins) feeds the Activity panel on the vendor order page
  (`components/orders/OrderActivity.tsx`) and "checked in by" on each item.
  Check-in photos and condition notes are optional.
- **Tag search:** Vendor/Admin → Tags has "Find a tag" (type or scan a code,
  or just the number) to mark missing/damaged/found or reprint one tag
  (`searchTags` in `src/lib/tagActions.ts`); a batch's list filters by code.
- **Support photos (`0039`):** customers (new ticket + replies) and support
  (replies) can attach up to 4 photos (`components/support/PhotoAttach.tsx`,
  shrunk to ≤1600px client-side) to the private `support-attachments` bucket
  under `<user id>/…`; paths go in `support_messages.attachments`
  (`cleanAttachments` checks them; trigger `guard_support_message` forces
  `author_id = auth.uid()` and own-folder paths). Pages show them via
  `signSupportPhotos` (1-hour signed links, service key after the viewer's
  own RLS read of the messages).
- **Password fields** use `components/ui/PasswordInput.tsx` (Show/Hide).
- **Responsive dashboards:** admin and vendor shells share `ShellNav` — a fixed
  sidebar on desktop (lg+), a top bar with a Menu button (all links + account)
  below that. Wrap data tables in `table-scroll` (globals.css): it scrolls
  sideways with edge shadows and keeps a readable min-width below lg. Page
  heading rows use `flex flex-wrap … gap-3` so badges/buttons wrap on phones.

- **Emails (`0043`/`0044`):** Admin → Emails (`/admin/emails`; the old
  `/admin/newsletters` links redirect) — email broadcasts, each with a kind
  (`newsletters.kind`: newsletter, promotion, announcement or service update;
  `src/lib/emailKinds.ts`). The tables keep the `newsletters` names. Platform
  admins only; support agents see a notice. "New email" creates the draft
  first (reusing the last header/footer images), then opens the editor
  (`components/newsletter/NewsletterEditor.tsx`): type, subject, preview text,
  header image, rich-text body (`RichTextEditor.tsx`: contentEditable +
  toolbar — heading/subheading, bold/italic/underline/strike, lists, quote,
  link, alignment, divider; paste is cleaned client-side), button text + link
  (http/https only), footer image, live desktop/phone preview (sandboxed
  iframe), audience = groups (customers, laundry managers, all laundry staff,
  laundriroom team, everyone) and/or chosen people, recipient count, Save
  draft / Send test to me / Send (confirm). Images go to the public
  `newsletter-images` bucket (`ImageSlot.tsx`, shrunk to 1200px). Server
  actions (`app/admin/newsletters/actions.ts`) clean the body with
  `sanitize-html` (`src/lib/newsletterHtml.ts`) on every save. The email is
  rendered by `src/lib/newsletter.ts`, mirrored to
  `supabase/functions/_shared/newsletter.ts` (keep in sync). Edge function
  `send-newsletter` (service key only) claims the draft (draft → sending, so
  it never goes twice), resolves `newsletter_audience()` (active, has email,
  not `profiles.newsletter_opt_out`), logs `newsletter_recipients`, then sends
  via the Resend batch API in the background, each email with its own
  unsubscribe link (`/unsubscribe?t=<profiles.unsubscribe_token>`, asks for a
  click) and one-click `List-Unsubscribe` (POST `/api/unsubscribe`). A sent
  email is locked (`guard_newsletter`, kind included) and shows a delivery
  report; Duplicate makes a new draft. Opt-out covers every kind. Customers
  also toggle "Emails from laundriroom" on their account page. Needs Resend connected (Admin → Integrations)
  + `RESEND_API_KEY`, and `SITE_URL` (secret) or `NEXT_PUBLIC_SITE_URL`.
- **Promo QR codes:** Admin → Promos shows a QR for the website and, per
  promo row, a QR for `/customer/order?promo=CODE` (plus `&vendor=<slug>` for
  a laundry's own code); Vendor → Promos shows their `/v/<slug>` page QR and
  one per promo (`components/promo/QrCard.tsx`: copy link, print-ready PNG
  with the code under the QR, or an A4 PDF made in the browser with pdf-lib —
  logo, 12 cm QR, code, link; links built by `src/lib/promoLinks.ts`). These
  QRs and the My page QR (which also has PNG + PDF downloads; shared
  `src/lib/qrPdf.ts`, text made font-safe by `pdfSafe`) carry the laundriroom mark in the middle
  (`src/lib/qrWithLogo.ts`: error correction H, logo badge ~22% wide; checked
  to decode with zxing down to 120px). Tag QRs stay plain (tiny prints). The
  order form shows a banner for `?promo=` and `createOrder` applies it with
  `redeem_promo` right after the order is created; the order page says
  whether it applied (`promo_applied` / `promo_error`). Signed-out scans go
  through sign-in/sign-up and come back to the same link.
- **Rider list (`0045`):** `rider_contacts` — one list per business of the
  laundry's own riders and dispatch-company riders (name, phone, own/dispatch,
  company, notes, optional `branch_id`; NULL = every branch). Riders have no
  login. Phones match by digits (`phone_key()`: 0803… = +234 803…; unique per
  vendor; `src/lib/phone.ts` mirrors it and builds Call/WhatsApp links). Any
  staff member reads (their branch + business-wide riders) and adds; only
  managers edit/archive (`can_manage_riders`: business-wide managers any
  rider, branch managers their branch's); `guard_rider_contact` keeps
  `vendor_id`/`created_by` fixed. On a delivery order the rider box is
  `components/riders/RiderPicker.tsx`: search/pick, or "+ New rider" with
  "Save to Dispatch list" → `assign_order_rider()` (branch staff/admin; reuses an
  existing number and un-archives it; a new contact gets the adder's branch;
  empty name+phone clears). The order keeps its own copy (`rider_name`,
  `rider_phone`, plus `rider_contact_id`), so editing/archiving a contact never
  changes past orders. Vendor → Dispatch (`app/vendor/dispatch`; the old `/vendor/riders` link redirects;
  `components/riders/RiderManager.tsx`) lists them with order counts.
  Pickups don't use the picker yet.
- **Payment before handover (`0046`):** the customer's 4-digit delivery code
  (`orders.handover_code`, shown on their order page until the order closes)
  closes an order only through `confirm_handover(order, code)`: it refuses
  until a payment has succeeded (`PAYMENT_PENDING`, the vendor is told to get
  the customer to pay and retry), then checks the code (`WRONG_CODE`). A
  payment no longer closes a pay-on-delivery order by itself
  (`on_payment_succeeded` only schedules the payout); the order stays
  Ready / Out for delivery. API users can't insert a `handover` stage
  directly (`guard_stage_event`). The vendor's rider box and the rider's
  WhatsApp message never show the code. Pressed processing stages stay ink
  (`OrderWorkspace` gets `doneStages`).
- **Tags at check-in (`0046`):** `check_item_tag` (before insert/update of
  `order_items.tag_code`) only accepts the order vendor's generated tags that
  are free (or already on this item): `TAG_UNKNOWN` / `TAG_IN_USE` /
  `TAG_UNAVAILABLE` (missing, damaged, retired). Codes are upper-cased; a
  bare number becomes `PREFIX-NNNN`. The check-in form requires a tag.
- **Nearest laundry:** the customer order form has "Find the nearest
  laundry" (phone location or a saved address) → `nearestBranches`
  (`customer/actions.ts`): straight-line km to every geocoded branch, then
  road km for the 10 closest in one Routes API `computeRouteMatrix` call
  (`drivingDistancesKm` in `src/lib/maps.ts`); without a key it stays
  straight-line. Laundries sort nearest first with "km away", and the
  nearest open laundry + branch is pre-selected (not when opened from a
  laundry's own link). The "Find the nearest laundry" box shows only
  when Google Maps is connected **and** the admin has turned on distance
  pricing (`mapsConfigured() && pricing.mode === "distance"`, passed as
  `nearestEnabled`); otherwise it's hidden.
- **Provider keys + function auth (`0046`):** Admin → Integrations stores the
  Resend / WhatsApp / SMS key in Supabase Vault (`set_integration_secret`,
  platform admins; read by edge functions with `integration_secret`, service
  role only; `supabase/functions/_shared/secrets.ts` falls back to the
  `RESEND_API_KEY` / `WHATSAPP_API_TOKEN` secrets). "Save & send test" really
  tests (Resend: email to you; WhatsApp: token can see the phone number ID)
  and shows the provider's error (`integration_settings.last_error`); an empty
  key box keeps the stored key; Disconnect deletes it. The server-only
  functions accept either service-key kind (old JWT or `sb_secret_…`):
  `_shared/auth.ts → isServiceCaller` — the hosted functions' own
  `SUPABASE_SERVICE_ROLE_KEY` is now an `sb_secret_` key while the app holds
  the JWT, which is what made sending say "unauthorized". The app passes
  `site_url` to `send-notification` for links/logo when the `SITE_URL` secret
  isn't set. `process-payouts` checks the hourly job's secret with
  `cron_secret_ok` (Vault copy), so `CRON_SECRET` is optional.
- **Admin vendor/user tools:** Admin → Vendors (list + a vendor's page) has
  Reset password (emails the vendor's business-wide managers) and Delete
  (`admin_delete_vendor`: only a vendor with no orders — `HAS_ORDERS`
  otherwise, suspend instead; its staff become customers; audit-logged).
  Admin → Users has Reset password per user (`sendPasswordReset`).
- **Set-up guide:** `docs/setup/laundriroom-setup-guide.pdf` (Google Maps,
  WhatsApp, Resend), from `docs/setup/setup-guide.html` via
  `scripts/render-setup-guide.mjs`.
- **Training decks:** `docs/presentations/` holds the team training deck and
  the Partner Playbook: PDFs, speaker notes and the slide sources (claude.ai
  Slides format, with images). Rebuild the PDFs with
  `scripts/render-deck-pdf.mjs` after editing a slide, and update the decks
  when a workflow or money rule they describe changes.

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
`assignRider` → `assign_order_rider`, picked from the saved rider list or typed in, storing `rider_name`/`rider_phone`; the rider is shown the order
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
