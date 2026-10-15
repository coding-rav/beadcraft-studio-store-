import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, renderEmail, type EmailCtx } from '../supabase/functions/_shared/email.ts';

const ctx: EmailCtx = { orderNumber: 'BC-261014-ABC123', customerName: 'Asha <script>alert(1)</script>', orderUrl: 'https://shop.example/account/orders/1',
  totalPaise: 9900, items: [{ name: 'Fox "Keychain" <b>', qty: 2, totalPaise: 5800 }], estimate: '18 Oct – 21 Oct 2026',
  carrier: 'DTDC', trackingNumber: 'T123', trackingUrl: 'javascript:alert(1)' };

test('user-controlled values are HTML-escaped', () => {
  const { html } = renderEmail('order_paid', ctx);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('"Keychain" <b>')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&quot;Keychain&quot; &lt;b&gt;'));
});
test('only http(s) tracking links are rendered', () => {
  assert.ok(!renderEmail('shipped', ctx).html.includes('javascript:'));
  assert.ok(renderEmail('shipped', { ...ctx, trackingUrl: 'https://track.example/T123' }).html.includes('https://track.example/T123'));
});
test('every kind renders a subject containing the order number and no secrets', () => {
  for (const k of ['order_paid', 'invoice_ready', 'shipped', 'delivered', 'cancelled', 'refund_started', 'refunded'] as const) {
    const m = renderEmail(k, ctx); assert.ok(m.subject.includes(ctx.orderNumber), k);
    assert.ok(!/\b(secret|password|api[_ -]?key|service[_ -]?role)\b/i.test(m.html), k);
  }
});
test('estimate is labelled as an estimate', () => assert.match(renderEmail('order_paid', ctx).html, /an estimate, not a guarantee/));
test('esc handles all special characters and null', () => { assert.equal(esc(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;'); assert.equal(esc(null), ''); });
