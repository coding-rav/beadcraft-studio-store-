import { afterPaid } from '../_shared/postpay.ts';
import { admin, authedUser, checkoutSignature, cors, json, rzp, safeEqual } from '../_shared/razorpay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const user = await authedUser(req);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (![order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature].every((v) => typeof v === 'string' && v.length < 100))
      return json({ error: 'Invalid request.' }, 400);

    const db = admin();
    const { data: o } = await db.from('orders').select('id,user_id,total_paise,razorpay_order_id,payment_status')
      .eq('id', order_id).maybeSingle();
    if (!o || o.user_id !== user.id || o.razorpay_order_id !== razorpay_order_id)
      return json({ error: 'Order not found.' }, 404);
    if (o.payment_status === 'paid') return json({ status: 'paid' });

    // Official Checkout signature: HMAC_SHA256(razorpay_order_id|razorpay_payment_id, key_secret)
    const expected = await checkoutSignature(Deno.env.get('RAZORPAY_KEY_SECRET')!, razorpay_order_id, razorpay_payment_id);
    if (!safeEqual(expected, razorpay_signature)) return json({ error: 'Payment could not be verified.' }, 400);

    // Cross-check with Razorpay itself (order, amount, currency, status).
    const p = await rzp(`/payments/${razorpay_payment_id}`);
    if (!p.ok) return json({ status: 'pending' }); // can't confirm yet; the webhook will reconcile
    const pay = p.body;
    if (pay.order_id !== razorpay_order_id || pay.amount !== o.total_paise || pay.currency !== 'INR')
      return json({ error: 'Payment details do not match this order.' }, 400);
    if (pay.status !== 'captured') return json({ status: 'pending' }); // authorized/other: wait for webhook

    const { data, error } = await db.rpc('mark_order_paid', { p_order: o.id, p_rzp_order: razorpay_order_id,
      p_payment: razorpay_payment_id, p_amount: pay.amount, p_currency: pay.currency });
    if (error) { console.error('mark_order_paid', error.message); return json({ status: 'pending' }); }
    if (data === 'paid') await afterPaid(db, o.id, pay.method);   // invoice + emails; never throws
    return json({ status: data === 'paid_needs_refund' ? 'needs_review' : 'paid' });
  } catch (e) {
    console.error('verify-razorpay-payment', (e as Error).message);
    return json({ status: 'pending' }, 500);
  }
});
