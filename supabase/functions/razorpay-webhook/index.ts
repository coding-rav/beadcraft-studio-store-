import { afterPaid } from '../_shared/postpay.ts';
import { processQueue } from '../_shared/notifyQueue.ts';
import { admin, hmacHex, safeEqual } from '../_shared/razorpay.ts';

// Deploy with verify_jwt = false (Razorpay can't send a Supabase JWT). Auth is the HMAC below.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text(); // raw, unmodified body — required for the signature
  const sig = req.headers.get('x-razorpay-signature') ?? '';
  const expected = await hmacHex(Deno.env.get('RAZORPAY_WEBHOOK_SECRET')!, raw);
  if (!sig || !safeEqual(expected, sig)) return new Response('Invalid signature', { status: 400 });

  const eventId = req.headers.get('x-razorpay-event-id') ?? '';
  const ev = JSON.parse(raw);
  const db = admin();
  try {
    if (eventId) {
      const { data: seen } = await db.from('razorpay_events').select('event_id').eq('event_id', eventId).maybeSingle();
      if (seen) return new Response('ok'); // duplicate delivery
    }
    const pay = ev.payload?.payment?.entity;
    const ref = ev.payload?.refund?.entity;
    let rzpOrder: string | null = pay?.order_id ?? ev.payload?.order?.entity?.id ?? null;

    if ((ev.event === 'payment.captured' || ev.event === 'order.paid') && pay) {
      const { data: o } = await db.from('orders').select('id').eq('razorpay_order_id', pay.order_id).maybeSingle();
      if (o && pay.status === 'captured') {
        const { data: res, error } = await db.rpc('mark_order_paid', { p_order: o.id, p_rzp_order: pay.order_id,
          p_payment: pay.id, p_amount: pay.amount, p_currency: pay.currency });
        if (error) throw new Error(error.message); // 500 -> Razorpay retries (amount mismatch lands here too)
        if (res === 'paid' || res === 'already_paid') await afterPaid(db, o.id, pay.method); // idempotent: heals a missed invoice/email
      }
    } else if (ev.event === 'payment.failed' && pay) {
      await db.rpc('mark_payment_failed', { p_rzp_order: pay.order_id, p_payment: pay.id,
        p_reason: pay.error_description ?? 'payment failed' });
    } else if (ev.event === 'refund.failed' && ref) {
      const { error } = await db.rpc('fail_refund', { p_refund_id: null, p_rzp_refund: ref.id, p_reason: 'refund failed at the payment provider' });
      if (error) throw new Error(error.message);
    } else if (ev.event === 'refund.processed' && ref) {
      const { error } = await db.rpc('record_full_refund', { p_payment: ref.payment_id, p_refund: ref.id, p_amount: ref.amount });
      if (error) throw new Error(error.message);
      await processQueue(db, { limit: 5 }).catch(() => undefined);
    }
    if (eventId) await db.from('razorpay_events').upsert({ event_id: eventId, event_type: ev.event,
      razorpay_order_id: rzpOrder, razorpay_payment_id: pay?.id ?? ref?.payment_id ?? null });
    return new Response('ok');
  } catch (e) {
    console.error('razorpay-webhook', ev.event, (e as Error).message);
    return new Response('retry', { status: 500 });
  }
});
