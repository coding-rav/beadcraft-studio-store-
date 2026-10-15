import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { checkoutSignature, hmacHex, safeEqual } from '../supabase/functions/_shared/crypto.ts';

const ref = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest('hex');

test('hmacHex matches Node crypto HMAC-SHA256', async () => {
  for (const [s, m] of [['k', 'm'], ['secret_key_123', 'order_ABC|pay_XYZ'], ['ü-secret', '{"event":"payment.captured"}']])
    assert.equal(await hmacHex(s, m), ref(s, m));
});
test('Razorpay checkout signature = HMAC(order_id|payment_id)', async () => {
  const sig = await checkoutSignature('test_secret', 'order_Abc123', 'pay_Def456');
  assert.equal(sig, ref('test_secret', 'order_Abc123|pay_Def456'));
  assert.notEqual(sig, ref('test_secret', 'pay_Def456|order_Abc123'), 'order of fields matters');
});
test('a tampered order or payment id changes the signature', async () => {
  const good = await checkoutSignature('s', 'order_1', 'pay_1');
  assert.ok(!safeEqual(good, await checkoutSignature('s', 'order_2', 'pay_1')));
  assert.ok(!safeEqual(good, await checkoutSignature('s', 'order_1', 'pay_2')));
  assert.ok(!safeEqual(good, await checkoutSignature('other', 'order_1', 'pay_1')));
});
test('safeEqual: equal, unequal, different length', () => {
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
  assert.ok(!safeEqual('', 'a'));
});
test('webhook signature is over the exact raw body (re-serialising breaks it)', async () => {
  const raw = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","amount":2000}}}}';
  const sig = await hmacHex('whsec', raw);
  assert.ok(safeEqual(sig, ref('whsec', raw)));
  const reserialised = JSON.stringify(JSON.parse(raw), null, 2);
  assert.ok(!safeEqual(sig, await hmacHex('whsec', reserialised)));
});
