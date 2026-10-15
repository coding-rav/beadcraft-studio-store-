import test from 'node:test';
import assert from 'node:assert/strict';
import { canAdminCancel, canCustomerCancel, canFulfil, canGenerateInvoice, canRequestRefund, canStartRefund, customerLabel } from '../src/lib/orderStatus.ts';

const o = (order_status: string, payment_status: string) => ({ order_status, payment_status });

test('fulfilment only moves forward and only for PAID orders', () => {
  assert.ok(canFulfil(o('confirmed', 'paid'), 'processing'));
  assert.ok(canFulfil(o('confirmed', 'paid'), 'shipped'));
  assert.ok(canFulfil(o('processing', 'paid'), 'shipped'));
  assert.ok(canFulfil(o('shipped', 'paid'), 'delivered'));
  assert.ok(!canFulfil(o('shipped', 'paid'), 'processing'));
  assert.ok(!canFulfil(o('delivered', 'paid'), 'shipped'));
  assert.ok(!canFulfil(o('confirmed', 'pending'), 'shipped'), 'unpaid must never ship');
  assert.ok(!canFulfil(o('pending', 'failed'), 'processing'));
});
test('customer cancellation rules', () => {
  assert.ok(canCustomerCancel(o('pending', 'pending')));
  assert.ok(canCustomerCancel(o('pending', 'failed')));
  assert.ok(canCustomerCancel(o('confirmed', 'paid')));
  assert.ok(!canCustomerCancel(o('processing', 'paid')));
  assert.ok(!canCustomerCancel(o('shipped', 'paid')));
  assert.ok(!canCustomerCancel(o('cancelled', 'pending')));
});
test('refund requests only for paid orders', () => {
  assert.ok(canRequestRefund(o('delivered', 'paid')));
  assert.ok(!canRequestRefund(o('pending', 'pending')));
  assert.ok(!canRequestRefund(o('refunded', 'refunded')));
});
test('a failed or pending payment is never labelled confirmed', () => {
  assert.equal(customerLabel(o('pending', 'pending')), 'Awaiting payment confirmation');
  assert.equal(customerLabel(o('confirmed', 'pending')), 'Awaiting payment confirmation');
  assert.equal(customerLabel(o('pending', 'failed')), 'Payment failed');
  assert.equal(customerLabel(o('cancelled', 'pending')), 'Cancelled');
  assert.equal(customerLabel(o('confirmed', 'paid')), 'Payment confirmed');
  assert.equal(customerLabel(o('shipped', 'paid')), 'Shipped');
  assert.equal(customerLabel(o('refunded', 'refunded')), 'Refunded');
});

test('packed and out_for_delivery fit the forward-only flow', () => {
  assert.ok(canFulfil(o('processing', 'paid'), 'packed'));
  assert.ok(canFulfil(o('packed', 'paid'), 'shipped'));
  assert.ok(canFulfil(o('shipped', 'paid'), 'out_for_delivery'));
  assert.ok(canFulfil(o('out_for_delivery', 'paid'), 'delivered'));
  assert.ok(!canFulfil(o('packed', 'paid'), 'processing'));
  assert.ok(!canFulfil(o('out_for_delivery', 'paid'), 'shipped'));
  assert.ok(!canFulfil(o('refund_pending', 'paid'), 'shipped'), 'no fulfilment while a refund is pending');
});
test('admin cancel, refund and invoice eligibility', () => {
  assert.ok(canAdminCancel(o('packed', 'paid')));
  assert.ok(!canAdminCancel(o('shipped', 'paid')));
  assert.ok(canAdminCancel(o('pending', 'pending')));
  assert.ok(canStartRefund(o('delivered', 'paid')));
  assert.ok(canStartRefund(o('cancelled', 'paid')));
  assert.ok(!canStartRefund(o('refund_pending', 'paid')));
  assert.ok(!canStartRefund(o('pending', 'pending')));
  assert.ok(!canRequestRefund(o('refund_pending', 'paid')));
  assert.ok(canGenerateInvoice(o('confirmed', 'paid')));
  assert.ok(!canGenerateInvoice(o('pending', 'pending')), 'no invoice for unpaid orders');
  assert.ok(!canGenerateInvoice(o('cancelled', 'paid')));
  assert.ok(!canGenerateInvoice(o('confirmed', 'failed')));
});
test('refund states are labelled honestly', () => {
  assert.equal(customerLabel(o('refund_pending', 'paid')), 'Refund pending');
  assert.equal(customerLabel(o('refunded', 'refunded')), 'Refunded');
  assert.equal(customerLabel(o('out_for_delivery', 'paid')), 'Out for delivery');
});
