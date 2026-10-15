# Payments troubleshooting
(Nothing below has been exercised against a real Razorpay account by the author; follow it in **Test Mode** first.)

| Symptom | Likely cause | What to do |
|---|---|---|
| "Could not start checkout" | Edge Functions not deployed, or secrets missing | `supabase functions list`; `supabase secrets list` (names only); redeploy |
| Checkout opens but order stays "being confirmed" | Webhook not reaching the function, wrong webhook secret, or payment only *authorized* (not captured) | Razorpay → Webhooks → delivery log; `supabase functions logs razorpay-webhook`; confirm the secret matches `RAZORPAY_WEBHOOK_SECRET`; in Razorpay settings enable auto-capture |
| Money taken but order unpaid | Lost webhook + browser closed | Admin → Payments → **Check now** → **Apply fixes** |
| Order shows paid + cancelled, with an internal note "PAID AFTER CANCELLATION…" | Payment arrived after the 30-minute reservation expired and stock was gone | Refund it from the order page |
| Refund stays pending | Razorpay has not confirmed (normal for a short time) or the webhook is not delivered | Check the refund in Razorpay; the `refund.processed` event completes it; use Payments → Check now if needed |
| "A refund already exists" | One refund per order is enforced | Check Admin → Refunds |
| No invoice button | Order not paid, or cancelled/refunded | Invoices exist only for confirmed paid orders |
| Invoice download fails | `generate-invoice` not deployed, or `invoices` bucket missing | Deploy the function; run migration 10 |
| Emails not arriving | `RESEND_API_KEY`/`EMAIL_FROM`/`SITE_URL` not set, or sender domain unverified | Notifications tab shows status and errors; set secrets; "Send queued now" |
| "We don't deliver to that state" | Serviceable-states list in Settings excludes it | Edit Settings or clear the list |
Never paste secrets into chat, tickets or screenshots. If a secret leaks, rotate it in Razorpay, then `supabase secrets set …`.
