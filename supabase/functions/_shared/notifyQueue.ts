// Sends queued notifications (table `notifications`) through Resend. At-least-once with a claim step, 5 attempts, then "dead".
// Needs server secrets RESEND_API_KEY, EMAIL_FROM and SITE_URL. Without them NOTHING is sent and rows stay pending.
import { renderEmail, type EmailCtx, type EmailKind } from './email.ts';
import { estimateDelivery, formatRange } from './delivery.ts';
type Db = any;
const MAX_ATTEMPTS = 5;

export const emailConfigured = () => Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_FROM') && Deno.env.get('SITE_URL'));

async function loadCtx(db: Db, orderId: string): Promise<{ ctx: EmailCtx; to: string } | null> {
  const { data: o } = await db.from('orders').select('order_number,customer_name,customer_email,total_paise,discount_paise,shipping_fee_paise,created_at,order_items(product_name,quantity,line_total_paise),shipments(carrier,tracking_number,tracking_url,estimated_delivery,created_at)').eq('id', orderId).maybeSingle();
  if (!o) return null;
  const { data: inv } = await db.from('invoices').select('invoice_number').eq('order_id', orderId).maybeSingle();
  const { data: del } = await db.from('store_settings').select('setting_value').eq('setting_key', 'delivery').maybeSingle();
  const ship = [...(o.shipments ?? [])].sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))[0];
  const range = ship?.estimated_delivery ? { min: new Date(ship.estimated_delivery), max: new Date(ship.estimated_delivery) } : estimateDelivery(new Date(o.created_at), del?.setting_value);
  return { to: o.customer_email, ctx: {
    orderNumber: o.order_number, customerName: o.customer_name, totalPaise: o.total_paise, discountPaise: o.discount_paise, shippingPaise: o.shipping_fee_paise,
    orderUrl: `${Deno.env.get('SITE_URL')!.replace(/\/+$/, '')}/account/orders/${orderId}`,
    items: (o.order_items ?? []).map((i: any) => ({ name: i.product_name, qty: i.quantity, totalPaise: i.line_total_paise })),
    estimate: range ? formatRange(range) : null, carrier: ship?.carrier, trackingNumber: ship?.tracking_number, trackingUrl: ship?.tracking_url, invoiceNumber: inv?.invoice_number } };
}

async function deliver(to: string, subject: string, html: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM'), to: [to], subject, html }), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`email provider responded ${r.status}`);
}

export async function processQueue(db: Db, opts: { orderId?: string; limit?: number } = {}) {
  if (!emailConfigured()) return { configured: false, sent: 0, failed: 0 };
  let q = db.from('notifications').select('id,order_id,kind,attempts').in('status', ['pending', 'failed']).lt('attempts', MAX_ATTEMPTS).order('created_at').limit(opts.limit ?? 20);
  if (opts.orderId) q = q.eq('order_id', opts.orderId);
  const { data: rows } = await q; let sent = 0, failed = 0;
  for (const n of rows ?? []) {
    const { data: claimed } = await db.from('notifications').update({ attempts: n.attempts + 1 }).eq('id', n.id).eq('attempts', n.attempts).in('status', ['pending', 'failed']).select('id');
    if (!claimed?.length) continue;                                  // another worker has it
    try {
      const c = await loadCtx(db, n.order_id); if (!c) throw new Error('order not found');
      const m = renderEmail(n.kind as EmailKind, c.ctx);
      await deliver(c.to, m.subject, m.html);
      await db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', n.id); sent++;
    } catch (e) {
      failed++;
      await db.from('notifications').update({ status: n.attempts + 1 >= MAX_ATTEMPTS ? 'dead' : 'failed', last_error: String((e as Error).message).slice(0, 200) }).eq('id', n.id);
    }
  }
  return { configured: true, sent, failed };
}
