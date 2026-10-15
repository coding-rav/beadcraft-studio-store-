# Beadcraft Studio — Vercel + Supabase + Razorpay store

**Small Beads. Big Vibes.** React 18 + TypeScript + Vite 5 + Tailwind 3 + React Router 6 on Vercel; Supabase for Postgres, Auth, Storage and Edge Functions; Razorpay for payments.

 ### What has and has not been verified (read first)
> This version was prepared in an environment with **no network, no Docker, no Postgres, no Supabase or Razorpay account**, and I could **not open your GitHub repository** (it returned 404, so it is private).
>
> | Check | Status |
> |---|---|
> | `npm test` (65 tests: money maths, safe redirects, order-status transitions, CSV formula-injection, image rules, delivery estimates, email templates, **invoice PDF generation**, Razorpay/webhook HMAC, static SQL policy checks, static Edge Function security checks) | **Run, 65 passed, 0 failed** (with `tsx`) |
| Invoice PDFs produced by the generator, parsed by an independent reader (pypdf): page count, text, footers, 70-line multi-page invoice | **Run once, passed** (not part of the repo) |
> | `npm run verify` (structure, lockfile hygiene, secret scan, env template) and `npm run check:env` | **Run, passed / behaves as designed** |
> | Type-check of `src/` against hand-written library stubs | **Run**: no errors except the `index.css` import (covered by real `vite/client` types) |
> | `npm ci`, `npm run typecheck` (real types), `npm run build` | **NOT RUN** (no network). You must run them. |
> | SQL migrations executed against Postgres, RLS tested with real users | **NOT RUN** |
> | Edge Functions deployed / Razorpay payment (test or live) / webhook delivery / emails | **NOT RUN** |
> | Browser/E2E tests, mobile layout of this React build | **NOT RUN** |
>
> `package-lock.json` could not be generated offline. Run `npm install` once and commit it (see "First-time setup"); after that `npm ci` works.

## Why Vercel failed, and what changed
Your log showed only three lines: `Unknown env config "cache-dir"`, `install-scripts`, and `esbuild@0.21.5 (postinstall)`. **These are warnings, not errors, and the actual failing line was not in what was supplied.** I can't confirm a root cause without the end of the log. What I found by inspecting the code instead:
- **A real, likely cause (fixed):** `tsconfig.json` type-checked `vite.config.ts`, which imports `node:url`, but `@types/node` was not installed. Because `npm run build` is `tsc --noEmit && vite build`, the type check would fail *after* a successful install, which looks exactly like "failed right after dependency installation". `tsconfig.json` now includes only `src/`; Vite loads its own config without type-checking.
- Removed the deprecated `baseUrl` from `tsconfig.json`.
- **Node pinned:** `engines.node = "20.x"` in `package.json` and `.nvmrc = 20`. In Vercel → Settings → General set Node.js Version to **20.x**.
- **`cache-dir` warning:** npm prints this when an environment variable named like `npm_config_cache-dir` / `NPM_CONFIG_CACHE_DIR` exists. This repo has no `.npmrc` and sets none. If you added such a variable under Vercel → Settings → Environment Variables, delete it. If you didn't, it is added by the build image and is harmless.
- **esbuild postinstall:** Vite 5's esbuild runs a small check script after installing its platform binary. It is safe and expected on Linux. Do **not** use `--ignore-scripts`; nothing needs to be approved and no security setting was changed.
- `npm run build` still runs a **real** type-check and `vite build`; nothing is swallowed (`|| true` is rejected by `npm run verify`).
- If the build still fails, copy the **last 40 lines** of the Vercel log (the red error) and the real error can be fixed in minutes.

## Commands
```bash
npm ci                # needs package-lock.json (see first-time setup)
npm run verify        # structure/secrets/lockfile guard
npm run typecheck     # tsc --noEmit
npm test              # 65 unit + static-policy tests (tsx --test)
npm run check:env     # checks variable NAMES only; never prints values
npm run build         # sitemap + tsc --noEmit + vite build  -> dist/
npm run ci            # all of the above, in order
```

## First-time setup (Windows PowerShell)
```powershell
# 1. Install Node 20 LTS from nodejs.org, then:
node -v                      # should print v20.x
cd path\to\beadcraft-studio-store
npm install                  # creates package-lock.json  -> commit it
Copy-Item .env.example .env.local
notepad .env.local           # set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SITE_URL
npm run ci
npm run dev                  # http://localhost:5173
```
Your Supabase URL is `https://qhelhtinhtjflexbakhe.supabase.co`. The anon/publishable key is in Supabase → Project Settings → API (the public one, never the service-role key). **Do not commit `.env.local`.**
Missing or invalid variables never fall back to fake data in production: visitors see a "We'll be right back" page. In `npm run dev` a banner explains exactly what is missing and sample products are shown.

## Environment variables
| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel (Production + Preview) and `.env.local` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | same | legacy `anon` key or `sb_publishable_…`; public by design |
| `VITE_SITE_URL` | same | your https site URL; used to generate `sitemap.xml` at build |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | **Supabase function secrets only** | never in Vercel or `VITE_` |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` | Supabase function secrets (optional) | customer emails (queued; sent only when all three are set). `SITE_URL` is used for order links in emails |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | injected into Edge Functions automatically | never put the service-role key anywhere else |

Use separate Supabase projects (and separate Razorpay test/live keys) for **Preview** and **Production** if you want them isolated; set the Vercel variables per environment.

## Supabase setup
1. **Existing project?** Your project already exists (`qhelhtinhtjflexbakhe`). If it was created by Lovable it may already contain tables. The migrations use plain `create table` and **fail rather than overwrite**. Do not run them blindly: use the checklist below first, or use a fresh project.
2. `npm i -g supabase`, then `supabase login`.
3. `supabase link --project-ref qhelhtinhtjflexbakhe`
4. `supabase migration list`, then `supabase db push` (additive; never resets).
5. Optional starter data: run `supabase/seed.sql` in the SQL editor (4 products, **stock 0 on purpose**).
6. Authentication → URL Configuration: **Site URL** = your Vercel URL; **Redirect URLs**: `https://YOUR_DOMAIN/login`, `https://YOUR_DOMAIN/reset-password`, `http://localhost:5173/**`. Authentication → Providers → Email on; choose whether "Confirm email" is required. CORS needs no change for the Supabase JS client.
7. Storage: migration 7 creates the public-read buckets `product-images`, `category-images`, `site-assets` (5 MB, jpeg/png/webp) with admin-only writes. Verify in Dashboard → Storage that all three exist; if one is missing the admin upload shows a clear error naming it.
8. Set secrets and deploy functions:
   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxx RAZORPAY_KEY_SECRET=xxxx RAZORPAY_WEBHOOK_SECRET=a-long-random-string
   supabase functions deploy create-razorpay-order
   supabase functions deploy verify-razorpay-payment
   supabase functions deploy razorpay-webhook --no-verify-jwt
   supabase functions deploy generate-invoice
   supabase functions deploy refund-razorpay-payment
   supabase functions deploy reconcile-payments
   supabase functions deploy process-notifications
   ```
   If the two JWT-verified functions return 401 with newer publishable keys, deploy them with `--no-verify-jwt` too; they verify the user themselves with `auth.getUser()`.
9. Optional: `npm run supabase:types` to generate `src/integrations/supabase/database.types.ts`.

### If your database already has tables (schema inspection checklist)
Back up first. Compare live tables/columns/constraints/triggers/policies with migrations 1–9 (`supabase db dump --schema public`). Check: money columns are integer paise; `select count(*) from orders where user_id is null`; no policy grants public write; existing products/orders are untouched. Reconcile by hand, then apply only the missing pieces as new migrations.

### Verify the database after migrating (run in the SQL editor)
```sql
-- every public table must have RLS on (expect no rows):
select tablename from pg_tables where schemaname='public' and not rowsecurity;
-- policies present:
select tablename, policyname, cmd from pg_policies where schemaname='public' order by 1,2;
-- customers must have no write grants on these (expect no rows):
select grantee, table_name, privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name in ('orders','order_items','payments','inventory_movements')
   and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE');
-- server-only functions must not be executable by clients (expect no rows):
select routine_name, grantee from information_schema.routine_privileges
 where routine_schema='public' and routine_name in ('create_checkout_order','mark_order_paid','mark_payment_failed','release_order','record_full_refund')
   and grantee in ('anon','authenticated','PUBLIC');
```

## Migrations
| File | Purpose |
|---|---|
| `20261012000100` catalog_and_store | categories, products (paise), images, settings, newsletter |
| `…000200` accounts | profiles, roles, addresses, cart, wishlist, `is_admin()`, signup trigger (never grants admin) |
| `…000300` orders_payments | orders, items (price snapshot), payments, inventory log, shipments, refund requests, webhook event log |
| `…000400` checkout_functions | order creation, reserve/release stock, idempotent mark-paid, failures, refunds (service role only) |
| `…000500` account_and_admin_functions | customer cancel / refund request, admin fulfilment, audited stock adjust |
| `…000600` rls_policies_and_grants | RLS everywhere, least-privilege grants |
| `…000700` storage | buckets + admin-only write policies |
| `…000800` require_authenticated_checkout | `orders.user_id` required (NOT VALID, old rows kept) + profile backfill |
| `20261013000100` coupons_audit_notifications | coupons + redemptions, coupon preview, order creation with coupon, audit log + triggers, refund review, email log |
| `20261014000100` orders_invoices_refunds_notifications | wider order statuses (packed, out for delivery, refund pending), immutable order history, notes, tracking + ETA, **invoices** (immutable, private bucket), **refunds** table + API-reconciled lifecycle, notification **queue**, cost prices (admin-only table), low-stock thresholds, tags/SEO fields, coupon eligibility, serviceable states, public-vs-admin-only settings |

**Order/payment/fulfilment states are separate.** `payment_status`: pending → (authorized) → paid | failed → refunded. `order_status`: pending → confirmed (only after verified payment) → processing → shipped → delivered; or cancelled / refunded. Fulfilment moves forward only and only for paid orders (`canFulfil`, tested; enforced in `admin_set_fulfillment`).

**Stock:** reserved when the order is created, released if unpaid after 30 minutes, never deducted twice. **Run the cleanup on a schedule:** enable the `pg_cron` extension (Dashboard → Database → Extensions) and run
`select cron.schedule('release-expired-orders','*/10 * * * *','select public.release_expired_orders()');`
Verify with `select jobname, schedule, active from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 5;`. A payment that arrives after expiry re-reserves stock if available; otherwise the order is flagged `paid_needs_refund` (paid + cancelled) for you to refund in Razorpay.

**Coupons:** percent or fixed (paise), start/expiry, minimum order, optional cap, total and per-customer limits, active flag. Validated and redeemed **inside the order transaction** with the coupon row locked, so two customers cannot take the last use; an expired/abandoned order releases its use. Percentage discounts round **down** to the paisa and never exceed the subtotal. Shipping is computed on the subtotal **before** the coupon. The checkout page's discount is a preview; the server recomputes it.

## Razorpay (Test Mode first)
1. Dashboard → Test mode → API keys → put the key id/secret in the Supabase secrets above.
2. Webhooks → add `https://qhelhtinhtjflexbakhe.supabase.co/functions/v1/razorpay-webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`. (Event names and payload fields were written from my knowledge of the Razorpay docs and **not** re-verified against live documentation here; confirm against current docs.)
3. Test checklist (all **not yet run**): success; failed card; closing the window then retrying (same order reused); invalid signature (tamper with the request) rejected; wrong amount rejected; browser closed after paying (webhook reconciles); duplicate webhook (no second email/stock change); coupon applied and released on abandon; refund via Dashboard flips the order to refunded.
4. Going live: create live keys and a live webhook, replace the three secrets, test one small real order, then announce. Rotate keys with `supabase secrets set …` (no redeploy needed) and update the webhook secret in the Razorpay Dashboard at the same time.

Flow: sign in → server prices cart, applies coupon, reserves stock → Razorpay order created server-side (paise, INR) → Checkout → verify function checks the HMAC (constant-time), fetches the payment from Razorpay and matches order id, amount, currency and `captured` → `mark_order_paid` → confirmation email (if configured). The webhook does the same independently with raw-body HMAC and event-id de-duplication. The success page shows "confirmed" only when the server says `paid`.

## Admin
Create the first admin (never via sign-up): sign up on the site, then in the SQL editor
```sql
select id, email from auth.users where email = 'you@example.com';
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com' on conflict do nothing;
```
`/admin` has: overview (verified sales only), orders (search/filter, details, fulfilment, tracking, Razorpay ids), products (create/edit/archive/delete, image upload with preview and type/size checks, price/sale price/SKU, featured, active, audited stock), categories (with image), coupons, refund requests (approve/reject), newsletter (search, unsubscribe, CSV export with confirmation), settings (announcement, shipping), and an audit log. Every action is re-checked in the database.

## Email
`supabase/functions/_shared/notify.ts` sends an order-confirmation email through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set (verify your sending domain in Resend). It is de-duplicated per order through `email_log`, and failures are recorded, never thrown. **Not implemented:** dispatch and refund emails (they happen in database functions, not Edge Functions), and a template engine. Swap provider by replacing `deliver()`.

## Deploy: GitHub → Vercel
```powershell
git add .
git commit -m "Production fixes: build, coupons, admin, tests"
git push origin main
```
Vercel → Add New → Project → import the repo. Framework **Vite**, Install `npm ci` (or leave default), Build `npm run build`, Output `dist`, Node **20.x**. Add the three `VITE_` variables for Production and Preview. Every push to `main` deploys; a failing build stays failed. After the domain exists, update Supabase Site URL/redirects and the Razorpay webhook. `vercel.json` rewrites all routes to `index.html` (refresh works), caches hashed assets for a year, and never caches `index.html`.

## Production launch checklist
See `DEPLOYMENT_CHECKLIST.md`.

## Troubleshooting
- **Blank / "We'll be right back":** the `VITE_` variables are missing or wrong; the dev banner names the problem. Redeploy after changing them (Vite reads them at build time).
- **Everything "Sold out":** stock is 0 until you add it in `/admin → products`.
- **`db push` "already exists":** you have an existing schema; use the checklist above.
- **401 from order function:** signed out, or see deploy note 8.
- **RLS "permission denied":** you are not an admin, or a grant is missing; run the verification SQL above.
- **Password reset link error:** add `/reset-password` to Supabase redirect URLs.
- **Upload fails "bucket missing":** run migration 7 or create the bucket in Storage.
- **CORS error calling a function:** redeploy the function; its CORS headers allow `*` by default (`_shared/razorpay.ts`) — tighten to your domain for production.
- **Payment stuck on "being confirmed":** check the webhook delivery log in Razorpay and `supabase functions logs razorpay-webhook`; confirm the webhook secret matches.

## Backup and recovery
Supabase → Database → Backups (daily on paid plans; on the free plan export manually: `supabase db dump -f backup.sql --linked`). Back up Storage buckets separately. Test a restore on a scratch project before you need it. Never run `supabase db reset` against production.

## Known limitations and unverified items
- **Not built:** product variants (the schema has no variants table), a dispatch/refund email, rate limiting (login, coupon-code guessing and newsletter are not throttled beyond Supabase's built-in auth limits), real E2E/browser tests, RLS integration tests against a live database, Razorpay refund API call from the admin (refunds are issued in the Razorpay Dashboard, the webhook reconciles), light/dark toggle, multi-image reordering, order invoices.
- Pages **Jewelry care, Shipping & returns, Contact, Privacy, Terms** contain honest placeholders; the owner must supply the text. "Style finder" says it is coming soon.
- The sitemap lists static pages only (products are dynamic).
- Image upload shows "Uploading…" but not a percentage (the Supabase JS upload API gives no progress events).
- All SQL is unexecuted; run the verification queries after `db push`.


## Version 3 additions (read with the guides below)
Guides: `ADMIN_GUIDE.md` (day-to-day), `PAYMENTS_TROUBLESHOOTING.md`, `MANUAL_TEST_CHECKLIST.md` (test-mode procedure and the separate live-launch checklist).

**Why products can look "Sold out" when you expect stock:** the seed inserts stock **0** on purpose, and the storefront reads `products.stock_quantity` everywhere (cards, product page, cart, checkout and the server all use that one column; reserved stock is already subtracted from it). The admin overview now warns when active products have 0 stock. Fix: Admin → Products → "Adjust stock".

**Order lifecycle (payment status and fulfilment status are separate):**
`pending` (awaiting payment) → `confirmed` (only after verified payment) → `processing` → `packed` → `shipped` → `out_for_delivery` → `delivered`; plus `cancelled`, `refund_pending`, `refunded`. Fulfilment only moves forward and only for paid orders (checked in SQL and unit-tested). Every change writes an immutable row to `order_events` (who, when, from/to); notes can be internal or customer-visible. Customers see a timeline of the customer-visible events.

**Invoices:** created automatically after a payment is verified (and on demand from the order page) by the `generate-invoice` function: a number from a database sequence (`BC-INV-2026-000001`, one per order, never reissued; a rolled-back transaction can leave a gap in the sequence), a snapshot of your business details at issue time, and a PDF stored in the **private** `invoices` bucket. Download = the function checks the order is visible to the caller through row-level security (its owner or an admin), then returns a **60-second signed link**. Issued invoices cannot be edited or deleted (database trigger). **Corrections:** do not edit; issue a credit note and a new invoice in your accounting process (no credit-note feature is built). Invoices print only the business details you enter in Admin → Settings; they say "INVOICE", do not itemise tax, and make no GST claim. The PDF uses built-in fonts, so the rupee sign is printed as "Rs.".

**Refunds:** Admin → Orders → open order → "Refund via Razorpay" calls `refund-razorpay-payment` (admin only, full refunds only, one per order, confirmation + reason required). The order shows **refund pending** until Razorpay's `refund.processed` webhook confirms; `refund.failed` returns the order to its previous state. If Razorpay does not answer, the refund stays pending and you are told to check the Dashboard; it is never shown as completed early. Admin → Payments runs **reconciliation** (orders unpaid here but captured at Razorpay).

**Delivery estimates:** configured in Admin → Settings (handling days + transit days, calendar days). Customers see an estimate only when transit days are set, always labelled "estimate, not a guarantee"; after dispatch, the date you type from the courier is shown. No courier API is integrated.

**Notifications:** events are queued once per order and kind (`notifications` table) and sent through Resend when `RESEND_API_KEY`, `EMAIL_FROM` and `SITE_URL` are set; otherwise they stay pending and the admin screen says so. Delivery is at-least-once with a claim step, 5 attempts, then `dead` (admin can retry). Retried webhooks cannot create duplicate rows.

**Roles/security recap:** the browser never supplies user ids, prices, totals, discounts, stock or payment state; admin = a row in `user_roles` created only by SQL you run; all admin writes pass RLS/`is_admin()`; cost prices, business/GST details, internal notes, audit log, notifications, refunds and invoices are admin-only or owner-only; `invoices` bucket has no client policies.

**Data retention (suggested, not automated):** keep order, invoice and payment records for the period your accountant advises (commonly several years for tax); delete abandoned carts and unsent notifications older than ~90 days; export or erase a customer's profile on request but keep invoices (legal records). Nothing here deletes data automatically.

**Rollback / recovery:** migrations are forward-only. To undo a bad change, write a new migration that reverses it; never edit an applied file. Before every `supabase db push` take a backup (`supabase db dump -f backup.sql --linked`). Edge Functions: redeploy the previous commit's version. Storage: back up the buckets (especially `invoices`) separately.

## Honest status of the v3 request
Implemented in code and covered by the tests listed above where they can run offline: admin dashboard with date filter, product management (create, edit, duplicate, archive, delete, cost price, threshold, tags, weight, SEO, image upload/reorder/delete), categories, order table (search incl. tracking, filters, sort, pagination, CSV with formula-injection protection), order detail (history, notes, tracking, cancel, refund, invoice), customer timeline/tracking/estimate/invoice download, invoices (PDF), refunds via API, reconciliation, coupons with eligibility, shipping/delivery settings with serviceable states, notification queue, audit log, error boundary, env check.
**Not done:** guest order lookup (optional in your brief), courier API integration, partial refunds, credit notes, GST/tax itemisation, rate limiting, browser/E2E tests, **DB-level concurrency/RLS integration tests** (the static SQL tests do not run SQL), and any live verification (SQL, Edge Functions, Razorpay, Resend, Vercel). See `VALIDATION_REPORT.md`.
#   b e a d c r a f t - s t u d i o - s t o r e - 
 
 
