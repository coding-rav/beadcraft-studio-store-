# Manual end-to-end checklist (owner, Test Mode)
Do this with Razorpay **Test Mode** keys and a throw-away customer account. Items marked ⚠ have never been run by the author.

## A. Test-mode checkout
1. ⚠ Admin → Products: set stock ≥ 2 on a product; Settings: save a shipping fee and delivery days.
2. ⚠ Signed out, add the product to the cart → Checkout → you are sent to sign-in → after login you return to checkout with the cart intact.
3. ⚠ Enter an address; apply a test coupon; confirm the total; Pay with Razorpay test card/UPI (see Razorpay's test credentials page).
4. ⚠ Success page shows "confirmed" only after a few seconds; order page shows *Payment confirmed* and a timeline; admin sees the order as paid/confirmed; stock dropped by the quantity; `inventory_movements` has one reservation.
5. ⚠ Order page → **Download invoice**: the PDF shows your business details, items, totals, payment reference. Another customer's order URL shows "Order not found".
6. ⚠ Failed payment (use a failing test card): no paid order; cart kept; retry succeeds without a second order.
7. ⚠ Close the payment window: order stays pending; after 30 minutes (with `pg_cron`) stock is released.
8. ⚠ Admin → mark processing → packed → shipped (add tracking + ETA) → delivered; customer timeline updates; emails arrive if configured.
9. ⚠ Admin → Refund via Razorpay: status *pending* → after Razorpay confirms (webhook) the order shows *Refunded*.
10. ⚠ Resend the same webhook from Razorpay's dashboard: nothing changes, no duplicate email.
11. ⚠ Sign in as a normal customer: /admin shows "Access denied"; `select public.is_admin()` is false.

## B. Live launch (only after A passes completely)
- [ ] Business details and policy texts filled in (Settings); accountant has reviewed the invoice layout and tax wording
- [ ] Live Razorpay keys set as Supabase secrets; live webhook created with the same events and a new secret
- [ ] `RAZORPAY_*` values rotated if they were ever exposed
- [ ] One real low-value order placed, invoiced, shipped and refunded end to end
- [ ] Backups taken; `pg_cron` job visible in `cron.job`
- [ ] Vercel production env vars set; `/admin` reachable only by the owner
