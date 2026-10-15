import { admin, cors, json, requireAdmin, rzp, authedUser } from '../_shared/razorpay.ts';

// Admin-only, full refunds only. The refund stays PENDING until Razorpay's refund.processed webhook confirms it.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const user = await authedUser(req);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    if (!(await requireAdmin(req))) return json({ error: 'Not allowed.' }, 403);
    const { order_id, reason } = await req.json().catch(() => ({}));
    if (typeof order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(order_id) || typeof reason !== 'string' || reason.trim().length < 3)
      return json({ error: 'Order and a reason are required.' }, 400);

    const db = admin();
    const { data: begun, error } = await db.rpc('begin_refund', { p_order: order_id, p_actor: user.id, p_reason: reason.trim() });
    if (error) {
      if (error.message.includes('REFUND_EXISTS')) return json({ error: 'A refund already exists for this order.' }, 409);
      if (error.message.includes('REFUND_NOT_ELIGIBLE')) return json({ error: 'This order is not eligible for a refund.' }, 409);
      console.error('begin_refund', error.message); return json({ error: 'Could not start the refund.' }, 500);
    }
    try {
      const res = await rzp(`/payments/${begun.payment_id}/refund`, { method: 'POST',
        body: JSON.stringify({ amount: begun.amount_paise, speed: 'normal', receipt: begun.refund_id.slice(0, 40), notes: { order_id } }) });
      if (res.ok) {
        await db.rpc('attach_refund', { p_refund: begun.refund_id, p_rzp_refund: res.body.id });
        return json({ status: 'pending', refund_id: res.body.id, message: 'Refund requested. It stays pending until Razorpay confirms it.' }, 202);
      }
      if (res.status >= 400 && res.status < 500) {                                   // definite rejection: undo our pending state
        await db.rpc('fail_refund', { p_refund_id: begun.refund_id, p_rzp_refund: null, p_reason: res.body?.error?.description ?? 'rejected by the payment provider' });
        return json({ error: res.body?.error?.description ?? 'The payment provider rejected the refund.' }, 409);
      }
    } catch (e) { console.error('razorpay refund call', (e as Error).message); }
    // Unknown outcome (timeout / 5xx): keep it pending. Check Razorpay, or run payment reconciliation.
    return json({ status: 'pending', message: 'The refund request may or may not have reached Razorpay. It is marked pending: check the Razorpay Dashboard before retrying.' }, 202);
  } catch (e) {
    console.error('refund-razorpay-payment', (e as Error).message);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
