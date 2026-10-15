export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refund_pending' | 'refunded';
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded';
type S = { order_status: string; payment_status: string };

// Mirrors admin_set_fulfillment(): paid orders only, forward only.
const NEXT: Record<string, string[]> = {
  confirmed: ['processing', 'packed', 'shipped'],
  processing: ['packed', 'shipped'],
  packed: ['shipped'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
};
export const FULFIL_STATUSES = ['processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
export const canFulfil = (o: S, to: string) => o.payment_status === 'paid' && (NEXT[o.order_status] ?? []).includes(to);

// Mirrors cancel_my_order(): unpaid open orders, or paid orders that have not started processing.
export const canCustomerCancel = (o: S) =>
  (o.order_status === 'pending' && (o.payment_status === 'pending' || o.payment_status === 'failed')) || (o.order_status === 'confirmed' && o.payment_status === 'paid');
// Mirrors admin_cancel_order().
export const canAdminCancel = (o: S) =>
  (o.order_status === 'pending' && (o.payment_status === 'pending' || o.payment_status === 'failed')) || (o.payment_status === 'paid' && ['confirmed', 'processing', 'packed'].includes(o.order_status));
export const canRequestRefund = (o: S) => o.payment_status === 'paid' && !['refunded', 'refund_pending'].includes(o.order_status);
// Mirrors begin_refund().
export const canStartRefund = (o: S) => o.payment_status === 'paid' && ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'].includes(o.order_status);
export const canGenerateInvoice = (o: S) => o.payment_status === 'paid' && !['pending', 'cancelled', 'refunded'].includes(o.order_status);

/** Customer-facing label. Fulfilment progress is only ever shown for PAID orders. */
export function customerLabel(o: S): string {
  if (o.order_status === 'refunded' || o.payment_status === 'refunded') return 'Refunded';
  if (o.order_status === 'refund_pending') return 'Refund pending';
  if (o.payment_status === 'paid') {
    const m: Record<string, string> = { confirmed: 'Payment confirmed', processing: 'Processing', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
    return m[o.order_status] ?? o.order_status;
  }
  if (o.payment_status === 'failed') return 'Payment failed';
  if (o.order_status === 'cancelled') return 'Cancelled';
  return 'Awaiting payment confirmation';
}
