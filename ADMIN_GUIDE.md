# Admin guide
Sign in with the admin account, then open **/admin**. (First admin: see README "Admin".)

| Tab | What you do there |
|---|---|
| Overview | Pick a period. Revenue counts verified paid orders minus cancelled/refunded. A yellow warning appears if active products have 0 stock (they show "Sold out"). |
| Orders | Search by order no./name/email/**tracking no.**, filter by dates, payment status, fulfilment, method, courier; sort; page through; **Export CSV** (asks for confirmation, formula-safe). Open an order for items, address, Razorpay ids, timeline, notes, tracking, invoice, cancel, refund. |
| Products | Add/edit/duplicate/archive/delete; sale vs original price; **cost price (visible only to admins)**; low-stock threshold; tags; weight; SEO; main image and extra images (upload, reorder, alt text, delete); **Adjust stock** (every change is recorded). |
| Categories | Add categories with an image, set order, activate/deactivate. |
| Coupons | Percent/fixed, minimum order, cap, start/expiry, total and per-customer limits, optional eligible products/categories. |
| Refunds | Customer refund requests (approve/reject) and the refunds sent to Razorpay with their status. |
| Payments | Reconciliation against Razorpay (see PAYMENTS_TROUBLESHOOTING.md). |
| Notifications | Email queue, "Send queued now", retry failed. |
| Newsletter | Search, unsubscribe, export (with confirmation). |
| Settings | Store profile, **business details for invoices**, shipping fee/free threshold, delivery days, serviceable states, policy text, logo. |
| Audit | Latest admin changes (who, what, when). |

## Daily routine
1. Overview → fix any "Sold out"/low-stock warnings.
2. Orders → filter *Payment: paid, Status: confirmed* → mark **processing → packed → shipped** (enter courier, tracking number/link and the courier's ETA if you have one).
3. When delivered, mark **delivered**.
4. Cancel/refund only from the order page; refunds stay *pending* until Razorpay confirms.

## Rules the system enforces for you
You cannot ship an unpaid order, move an order backwards, mark an order paid by hand, refund twice, edit an issued invoice, or reduce stock below zero.
