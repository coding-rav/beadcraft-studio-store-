// Pure email templates (no secrets, no network). Every dynamic value is HTML-escaped.
export type EmailKind = 'order_paid' | 'invoice_ready' | 'shipped' | 'delivered' | 'cancelled' | 'refund_started' | 'refunded';
export type EmailCtx = {
  orderNumber: string; customerName: string; orderUrl: string; totalPaise: number; discountPaise?: number; shippingPaise?: number;
  items: { name: string; qty: number; totalPaise: number }[];
  estimate?: string | null; carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null; invoiceNumber?: string | null;
};
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const rs = (p: number) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const safeUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export function renderEmail(kind: EmailKind, c: EmailCtx): { subject: string; html: string } {
  const rows = c.items.map((i) => `<li>${esc(i.name)} × ${i.qty} — ${rs(i.totalPaise)}</li>`).join('');
  const summary = `<ul>${rows}</ul>${c.discountPaise ? `<p>Discount: −${rs(c.discountPaise)}</p>` : ''}${c.shippingPaise ? `<p>Shipping: ${rs(c.shippingPaise)}</p>` : ''}<p>Total: <b>${rs(c.totalPaise)}</b></p>`;
  const link = `<p><a href="${esc(c.orderUrl)}">View your order</a> (sign in required)</p>`;
  const est = c.estimate ? `<p>Estimated delivery: <b>${esc(c.estimate)}</b> (an estimate, not a guarantee).</p>` : '';
  const hi = `<p>Hi ${esc(c.customerName)},</p>`; const sign = '<p>— Beadcraft Studio</p>';
  const o = esc(c.orderNumber);
  switch (kind) {
    case 'order_paid': return { subject: `Order ${c.orderNumber} confirmed`, html: `${hi}<p>Your payment for order <b>${o}</b> is confirmed. A little handmade happiness is on its way.</p>${summary}${est}${link}${sign}` };
    case 'invoice_ready': return { subject: `Invoice ready for order ${c.orderNumber}`, html: `${hi}<p>Your invoice${c.invoiceNumber ? ` <b>${esc(c.invoiceNumber)}</b>` : ''} for order <b>${o}</b> is ready. Sign in to download it from your order page.</p>${link}${sign}` };
    case 'shipped': { const t = safeUrl(c.trackingUrl);
      return { subject: `Order ${c.orderNumber} has shipped`, html: `${hi}<p>Your order <b>${o}</b> is on its way${c.carrier ? ` with ${esc(c.carrier)}` : ''}.</p>${c.trackingNumber ? `<p>Tracking number: <b>${esc(c.trackingNumber)}</b></p>` : ''}${t ? `<p><a href="${esc(t)}">Track your package</a></p>` : ''}${est}${link}${sign}` }; }
    case 'delivered': return { subject: `Order ${c.orderNumber} delivered`, html: `${hi}<p>Your order <b>${o}</b> was marked as delivered. We hope it makes you smile.</p>${link}${sign}` };
    case 'cancelled': return { subject: `Order ${c.orderNumber} cancelled`, html: `${hi}<p>Your order <b>${o}</b> has been cancelled.</p><p>If you already paid, a refund will be processed and you will get another email when it is confirmed.</p>${link}${sign}` };
    case 'refund_started': return { subject: `Refund started for order ${c.orderNumber}`, html: `${hi}<p>We have started a refund of <b>${rs(c.totalPaise)}</b> for order <b>${o}</b>. Banks can take several business days to show it.</p>${link}${sign}` };
    case 'refunded': return { subject: `Refund confirmed for order ${c.orderNumber}`, html: `${hi}<p>Your refund of <b>${rs(c.totalPaise)}</b> for order <b>${o}</b> has been confirmed by our payment provider.</p>${link}${sign}` };
  }
}
