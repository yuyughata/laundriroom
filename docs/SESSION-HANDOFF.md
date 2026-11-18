# Session handoff

A durable catch-up note so any Claude Code session — on any account with access
to this repo — can continue where the last chat left off. The chat transcript
itself does **not** live in GitHub; this file is the substitute. Read it
together with `CLAUDE.md` (architecture + business rules) and `README.md`.

_Last updated: 2026-11-18._

---

## 1. Where the code stands

- **Default branch:** `main`. Active dev branch: `claude/tender-edison-q2a3bl`
  (kept in sync with `main`).
- Everything built so far is **merged to `main`** and deploys to Vercel. The
  most recent feature merged was **promo edit/delete** (PR #20): edit and delete
  controls on **Admin → Promos** and **Vendor → Promos**
  (`src/app/admin/promos/*`, `src/app/vendor/promos/*`, with
  `updatePromo`/`deletePromo` and `updateVendorPromo`/`deleteVendorPromo`
  actions).
- Live database: Supabase project **`fgbbtkozkmdlvskrezwh`** ("Laundriroom"),
  migrations `0001`–`0053` applied. There is a second, unrelated project
  (`nchgcofgwhvukuwynfnp`, "countribus") on the same org — don't touch it.
- To continue engineering work: open a Claude Code session on this repo, read
  `CLAUDE.md`, run `npm install && npm run dev`, and pick a task from
  "Good next tasks" in `CLAUDE.md` or §5 below.

## 2. Marketing / advert deliverables (in this repo)

Committed under **`docs/marketing/`** so they survive beyond any one chat:

| File | What it is |
|---|---|
| `laundriroom-customer-order-flow.pdf` | 7-page portrait storyboard, 10 phone scenes, discover → rate |
| `laundriroom-vendor-dashboard-flow.pdf` | 12-page landscape storyboard, 10 dashboard scenes, queue → get paid |
| `customer-order-flow-screens/*.png` | 10 individual high-res phone screens (804×1748) |
| `vendor-dashboard-flow-screens/*.png` | 10 individual high-res dashboard screens (2880×1800) |

All captured from the **live product** (not mock-ups), Ink & Ivory theme. The
PNGs are raw screens (no frames/captions); the PDFs add phone/browser frames,
scene numbers and captions.

## 3. How the screenshots were produced (repeatable recipe)

This is the non-obvious part — keep it for the next time marketing screens are
needed. The app talks to the **live** Supabase, so screens must be staged
safely.

**Demo accounts (password `LaundriDemo!2026`, set this session):**
- `demo.customer@laundriroom.test` — role `customer`.
- `demo.vendor@laundriroom.test` — `vendor_manager` of **Fold & Press,
  Rayfield** (the seed demo vendor, id `…f01d`, normally **suspended**).
- There is also a real verified vendor "Laundriroom" (manager Yusuf) used for
  the customer-flow screens.

**Running the app locally against the cloud sandbox had three gotchas:**
1. **Network allowlist** — the sandbox egress proxy must allow
   `fgbbtkozkmdlvskrezwh.supabase.co` (added to the Default environment).
2. **Node proxy** — Node's `fetch` (undici) ignores `HTTPS_PROXY`; start dev
   with **`NODE_USE_ENV_PROXY=1 npm run dev`** or server-side calls fail with
   `ENOTFOUND`.
3. **Middleware auth** — Next middleware runs in the Edge runtime, whose fetch
   can't reach Supabase through the proxy, so it wrongly redirects to `/login`.
   For local capture only, a temporary `SCREENSHOT_BYPASS=1` short-circuit was
   added at the top of `updateSession` (`src/lib/supabase/middleware.ts`) and
   **reverted afterwards**. ⚠️ Never commit that bypass.

**Staging data safely:** demo orders were inserted via SQL with
`set session_replication_role = replica;` (triggers OFF) so **no notifications
fired and no payout rail ran**; order-placed alerts come only from the app's
`createOrder` action, never DB triggers, and `vendor_payout_accounts` is empty
so no payout could ever move money. All seeded rows were deleted and Fold &
Press restored to `suspended` after capture. For My-page link/QR, set
`NEXT_PUBLIC_SITE_URL=https://www.laundriroom.ng` temporarily (default local is
`http://localhost:3000`).

Capture scripts used Playwright (`chromium`, `--no-sandbox`) at phone
(402×874, dsf 2) and desktop (1440×900, dsf 2) viewports. The pre-installed
browser is at `/opt/node-tools/node_modules/playwright`.

## 4. Known transient / local-only state (not in git)

- The `SCREENSHOT_BYPASS` middleware edit and the `NEXT_PUBLIC_SITE_URL` change
  were **reverted**; `.env.local` is back to `http://localhost:3000`.
- Demo-account passwords (`LaundriDemo!2026`) remain set on the two
  `*.test` accounts. Harmless demo accounts — clear them if undesired.
- All seeded demo orders/items/payments/riders were removed; Fold & Press is
  `suspended` again.

## 5. Open follow-ups (from CLAUDE.md "Good next tasks")

- Implement the **SMS adapter** in `send-notification`.
- Fire `send-notification` on the remaining order events (checked in, ready,
  out for delivery, payment received, closed) — only placed/confirmed are wired.
- **Invoice PDF** generation + `invoices` storage bucket.
- Item **photo capture** on check-in (bucket + policies already exist).
- Email the applicant on approve/reject; email admin on a new application.
- Rider-facing notifications once the SMS adapter lands.
- Formalise the Postgres trigger test harness.

## 6. Continuity notes

- **Code + these docs** travel with the repo, so a session on a *different*
  Claude account can read them and carry on. The **chat history does not** —
  there's no sync of a Claude conversation into GitHub.
- When you resume, update this file at the end of a working session so the next
  one stays oriented.
