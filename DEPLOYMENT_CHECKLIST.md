# Launch checklist
Tick in order. Items marked ⚠ were never executed by the author; verify them yourself.

## Code
- [ ] `npm install` once, commit `package-lock.json`
- [ ] ⚠ `npm run ci` passes locally (verify, typecheck, tests, build)
- [ ] `.env.local` is NOT committed (`git status` shows it ignored)

## Supabase
- [ ] Existing-schema checklist done (or fresh project)
- [ ] ⚠ `supabase db push` succeeded; verification SQL returns the expected empty results
- [ ] Auth: Site URL + redirect URLs set; email confirmation decision made
- [ ] Storage buckets exist (3); upload a test image from /admin
- [ ] First admin created by SQL; /admin works for that user and shows "Access denied" for others
- [ ] Shipping rule set in /admin → settings; stock set per product
- [ ] `pg_cron` schedule created for `release_expired_orders()` and visible in `cron.job`
- [ ] Function secrets set (names via `npm run check:env`); 7 functions deployed (`razorpay-webhook` with `--no-verify-jwt`; also generate-invoice, refund-razorpay-payment, reconcile-payments, process-notifications)
- [ ] ⚠ Migration 10 applied; `invoices` bucket exists and is **private**
- [ ] Settings → business details, delivery days, shipping fee saved

## Razorpay (Test Mode)
- [ ] ⚠ Webhook added with the 4 events and the same secret
- [ ] ⚠ Successful payment → order "Confirmed" only after verification; email received if configured
- [ ] ⚠ Failed/cancelled payment → no paid order, cart kept, retry works, stock not double-deducted
- [ ] ⚠ Duplicate webhook delivery causes no second state change
- [ ] ⚠ Refund in Razorpay → order becomes refunded
- [ ] ⚠ Coupon: applied, expired, used-up and per-customer limits behave

## Vercel
- [ ] Node 20.x; Build `npm run build`; Output `dist`
- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` set (Production + Preview)
- [ ] Refresh on /login, /account, /checkout, /admin works; unknown URL shows the 404 page
- [ ] robots.txt and sitemap.xml load

## Go live
- [ ] Owner-written text for care, shipping/returns, contact, privacy, terms
- [ ] Live Razorpay keys + live webhook; one small real order tested; secrets rotated if ever exposed
- [ ] Backup taken
