import { admin, authedUser, cors, json, rzp } from '../_shared/razorpay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const user = await authedUser(req);
    if (!user) return json({ error: 'Please sign in to check out.' }, 401);

    const b = await req.json();
    const a = b.address ?? {};
    const items = Array.isArray(b.items) ? b.items : [];
    const bad = (m: string) => json({ error: m }, 400);
    if (!b.name?.trim() || b.name.length > 100) return bad('Enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email ?? '')) return bad('Enter a valid email.');
    if (!/^[6-9]\d{9}$/.test(b.phone ?? '')) return bad('Enter a valid 10-digit mobile number.');
    if (!a.line1?.trim() || !a.city?.trim() || !a.state?.trim() || !/^\d{6}$/.test(a.pincode ?? ''))
      return bad('Complete the shipping address (6-digit PIN code).');
    if (!items.length || items.length > 50) return bad('Your cart is empty.');
    if (!/^[0-9a-f-]{36}$/i.test(b.idempotency_key ?? '')) return bad('Missing request key.');
    const coupon = typeof b.coupon === 'string' ? b.coupon.trim().toUpperCase() : '';
    if (coupon && !/^[A-Z0-9_-]{3,32}$/.test(coupon)) return bad('That coupon code isn’t valid.');
    // NOTE: prices/totals/discounts from the browser are ignored on purpose.
    const clean = items.map((i: any) => ({ product_id: String(i.product_id), quantity: Number(i.quantity) }));
    if (clean.some((i: any) => !/^[0-9a-f-]{36}$/i.test(i.product_id) || !Number.isInteger(i.quantity)))
      return bad('Invalid cart.');

    const db = admin();
    const { data, error } = await db.rpc('create_checkout_order', {
      p_user: user.id, p_name: b.name.trim(), p_email: b.email.trim(), p_phone: b.phone,
      p_address: { line1: a.line1.trim(), line2: a.line2?.trim() ?? '', city: a.city.trim(), state: a.state.trim(), pincode: a.pincode },
      p_items: clean, p_idem: b.idempotency_key, p_coupon: coupon || null,
    });
    if (error) {
      const m = error.message;
      if (m.includes('OUT_OF_STOCK')) return json({ error: 'Sorry, ' + m.split(': ')[1] + ' is out of stock.' }, 409);
      const COUPON: Record<string, string> = {
        COUPON_INVALID: 'That coupon code isn’t valid.', COUPON_NOT_STARTED: 'That coupon isn’t active yet.',
        COUPON_EXPIRED: 'That coupon has expired.', COUPON_MIN_ORDER: 'Your order is below the minimum for this coupon.',
        COUPON_EXHAUSTED: 'That coupon has been fully redeemed.', COUPON_USED: 'You have already used this coupon.', COUPON_NOT_ELIGIBLE: 'This coupon doesn’t apply to the items in your cart.' };
      const cc = Object.keys(COUPON).find((k) => m.includes(k));
      if (cc) return json({ error: COUPON[cc], code: cc }, 409);
      if (m.includes('NOT_SERVICEABLE')) return json({ error: 'Sorry, we don’t deliver to that state yet.', code: 'NOT_SERVICEABLE' }, 409);
      if (m.includes('ORDER_CLOSED')) return json({ error: 'That checkout expired. Please press Pay again.', code: 'ORDER_CLOSED' }, 409);
      if (m.includes('AUTH_REQUIRED')) return json({ error: 'Please sign in to check out.' }, 401);
      if (m.includes('PRODUCT_UNAVAILABLE') || m.includes('BAD_QUANTITY')) return json({ error: 'An item in your cart is unavailable. Refresh your cart.' }, 409);
      console.error('create_checkout_order', m);
      return json({ error: 'Could not start checkout. Please try again.' }, 500);
    }

    let rzpOrderId: string | null = data.razorpay_order_id; // idempotent retry may already have one
    if (!rzpOrderId) {
      const res = await rzp('/orders', { method: 'POST', body: JSON.stringify({
        amount: data.total_paise, currency: 'INR', receipt: data.order_number, notes: { order_id: data.order_id } }) });
      if (!res.ok) {
        console.error('razorpay order failed', res.status, res.body?.error?.description);
        await db.rpc('release_order', { p_order: data.order_id }); // give the stock back
        return json({ error: 'Payment service is unavailable. Please try again.' }, 502);
      }
      rzpOrderId = res.body.id;
      await db.from('orders').update({ razorpay_order_id: rzpOrderId }).eq('id', data.order_id);
      await db.from('payments').insert({ order_id: data.order_id, provider: 'razorpay',
        provider_order_id: rzpOrderId, amount_paise: data.total_paise, currency: 'INR', status: 'pending' });
    }
    return json({ order_id: data.order_id, order_number: data.order_number, razorpay_order_id: rzpOrderId,
      amount: data.total_paise, currency: 'INR', key_id: Deno.env.get('RAZORPAY_KEY_ID') });
  } catch (e) {
    console.error('create-razorpay-order', (e as Error).message);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
