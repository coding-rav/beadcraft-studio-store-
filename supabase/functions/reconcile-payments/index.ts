import { admin, authedUser, cors, json, requireAdmin, rzp } from '../_shared/razorpay.ts';
import { afterPaid } from '../_shared/postpay.ts';

// Admin-only. Finds orders this system thinks are unpaid although Razorpay shows a CAPTURED payment for the exact amount
// (e.g. a lost webhook). With { apply: true } it marks them paid through the same idempotent function the webhook uses.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const user = await authedUser(req);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    if (!(await requireAdmin(req))) return json({ error: 'Not allowed.' }, 403);
    const { apply } = await req.json().catch(() => ({}));
    const db = admin();
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString(); const olderThan = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: orders } = await db.from('orders').select('id,order_number,total_paise,payment_status,order_status,razorpay_order_id')
      .in('payment_status', ['pending', 'failed']).not('razorpay_order_id', 'is', null).gte('created_at', since).lte('created_at', olderThan).limit(50);
    const out: any[] = [];
    for (const o of orders ?? []) {
      const r = await rzp(`/orders/${o.razorpay_order_id}/payments`);
      if (!r.ok) { out.push({ order: o.order_number, problem: 'could not query Razorpay' }); continue; }
      const captured = (r.body.items ?? []).find((p: any) => p.status === 'captured' && p.amount === o.total_paise && p.currency === 'INR');
      if (!captured) continue;
      const item: any = { order: o.order_number, problem: 'Razorpay shows a captured payment but this order is unpaid', payment: captured.id, applied: false };
      if (apply) {
        const { data, error } = await db.rpc('mark_order_paid', { p_order: o.id, p_rzp_order: o.razorpay_order_id, p_payment: captured.id, p_amount: captured.amount, p_currency: captured.currency });
        item.applied = !error; item.result = error ? 'error' : data;
        if (!error && (data === 'paid')) await afterPaid(db, o.id, captured.method);
      }
      out.push(item);
    }
    return json({ checked: (orders ?? []).length, conflicts: out });
  } catch (e) { console.error('reconcile-payments', (e as Error).message); return json({ error: 'Something went wrong.' }, 500); }
});
