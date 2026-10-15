# Implementation report (v3)
See README "Version 3 additions" and VALIDATION_REPORT.md. **Nothing here has run against a real Supabase, Razorpay, Resend or Vercel.**

## Audit findings that drove the work
- "Sold out" everywhere: the seed sets `stock_quantity = 0` on purpose; the storefront, cart, checkout and server all read that single column. Added an admin warning and per-product sold-out/low flags.
- No order history/notes/tracking, no invoices, no API refunds, no reconciliation, no email queue, cost price and business/GST settings had no admin-only home, settings were all public-readable.

## Migration `20261014000100`
Statuses packed/out_for_delivery/refund_pending; `order_events` (immutable); `notifications` queue (+ trigger); `invoices` (immutable, sequence numbers) + private `invoices` bucket; `refunds` (one active per order); `product_costs` (admin only); low-stock threshold, tags, weight, SEO; coupon eligibility; serviceable-states check; `settings_read_public` whitelist (business details admin-only); replacements for create_checkout_order, mark_order_paid, record_full_refund, cancel_my_order, admin_set_fulfillment, preview_coupon; new admin functions. Forward-only; nothing dropped except superseded function signatures.

## Edge Functions
New: generate-invoice (RLS-visible order + 60 s signed URL), refund-razorpay-payment (admin, full, pending until webhook), reconcile-payments (admin), process-notifications (admin). Changed: create (coupon eligibility/serviceable errors), verify and webhook (payment method, invoice, queue; `refund.failed`; idempotent healing). Shared: pdf, email, delivery, crypto, invoice, notifyQueue, postpay.

## Frontend
Admin: overview (period filter), orders (filters, sort, pagination, CSV, detail/history/notes/tracking/cancel/refund/invoice), products (extended + gallery + duplicate), categories, coupons (eligibility), refunds, payments, notifications, newsletter, settings (profile, business, shipping, delivery, policies), audit. Customer: timeline, tracking, delivery estimate, invoice download. Error boundary; policy pages read from settings.

## Not done
Guest lookup, courier API, partial refunds, credit notes, GST itemisation, rate limiting, E2E tests, DB-level concurrency/RLS tests, any live verification.
