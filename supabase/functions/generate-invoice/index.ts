import { admin, authedUser, cors, json, userClient } from '../_shared/razorpay.ts';
import { ensureInvoice } from '../_shared/invoice.ts';

// Authorisation = Row Level Security: the order must be VISIBLE to the caller (its owner, or an admin).
// The PDF lives in a private bucket; the caller gets a 60-second signed URL. Invoices exist only for confirmed, paid orders.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const user = await authedUser(req);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    const { order_id } = await req.json().catch(() => ({}));
    if (typeof order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(order_id)) return json({ error: 'Invalid request.' }, 400);

    const { data: o } = await userClient(req).from('orders').select('id,payment_status,order_status').eq('id', order_id).maybeSingle();
    if (!o) return json({ error: 'Order not found.' }, 404);                       // not yours (or does not exist): same answer
    if (o.payment_status !== 'paid' || ['pending', 'cancelled', 'refunded'].includes(o.order_status))
      return json({ error: 'An invoice is available once the payment is confirmed.' }, 409);

    const db = admin();
    const inv = await ensureInvoice(db, order_id);
    const { data: signed, error } = await db.storage.from('invoices').createSignedUrl(inv.path, 60);
    if (error || !signed?.signedUrl) return json({ error: 'Could not prepare the invoice. Please try again.' }, 500);
    return json({ url: signed.signedUrl, invoice_number: inv.invoiceNumber });
  } catch (e) {
    console.error('generate-invoice', (e as Error).message);
    return json({ error: 'Could not prepare the invoice. Please try again.' }, 500);
  }
});
