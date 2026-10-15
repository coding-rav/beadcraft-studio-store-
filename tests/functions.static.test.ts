// Static guards over the Edge Function sources (they do not execute the functions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'supabase/functions';
const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
const src = Object.fromEntries(files(root).filter((f) => f.endsWith('.ts')).map((f) => [f, readFileSync(f, 'utf8')]));

test('secrets are never written to logs', () => {
  for (const [f, s] of Object.entries(src))
    for (const line of s.split('\n').filter((l) => /console\./.test(l)))
      assert.ok(!/KEY_SECRET|WEBHOOK_SECRET|RESEND_API_KEY|SERVICE_ROLE/.test(line), `${f}: ${line.trim()}`);
});
test('webhook verifies the HMAC over the raw body BEFORE parsing JSON', () => {
  const s = src[join(root, 'razorpay-webhook/index.ts')];
  const raw = s.indexOf('await req.text()'), sig = s.indexOf('hmacHex('), parse = s.indexOf('JSON.parse');
  assert.ok(raw > -1 && sig > raw && parse > sig, 'order must be text() -> HMAC -> JSON.parse');
  assert.match(s, /Invalid signature/); assert.match(s, /razorpay_events/);
});
test('verify function checks signature, order owner, amount, currency and captured status', () => {
  const s = src[join(root, 'verify-razorpay-payment/index.ts')];
  for (const needle of ['checkoutSignature', 'o.user_id !== user.id', 'pay.amount !== o.total_paise', "pay.currency !== 'INR'", "pay.status !== 'captured'"]) assert.ok(s.includes(needle), needle);
});
test('every user-facing function authenticates; invoice access relies on RLS visibility', () => {
  for (const fn of ['create-razorpay-order', 'verify-razorpay-payment', 'generate-invoice', 'refund-razorpay-payment', 'reconcile-payments', 'process-notifications'])
    assert.match(src[join(root, fn, 'index.ts')], /authedUser\(req\)/, fn);
  assert.match(src[join(root, 'generate-invoice/index.ts')], /userClient\(req\)\.from\('orders'\)/);
  assert.match(src[join(root, 'generate-invoice/index.ts')], /createSignedUrl\([^,]+, 60\)/);
});
test('refund, reconcile and notification functions are admin-only', () => {
  for (const fn of ['refund-razorpay-payment', 'reconcile-payments', 'process-notifications']) assert.match(src[join(root, fn, 'index.ts')], /requireAdmin\(req\)/, fn);
});
test('refunds are never reported as completed by the refund function', () => {
  const s = src[join(root, 'refund-razorpay-payment/index.ts')];
  assert.ok(!/status: 'processed'/.test(s)); assert.match(s, /status: 'pending'/);
});
test('the browser-supplied user id is never trusted', () => {
  assert.ok(!/body\.user_id|b\.user_id|user_id\s*:\s*b\./.test(src[join(root, 'create-razorpay-order/index.ts')]));
  assert.match(src[join(root, 'create-razorpay-order/index.ts')], /p_user: user\.id/);
});
test('the webhook function is the only one deployed without JWT verification', () => {
  const toml = readFileSync('supabase/config.toml', 'utf8');
  const off = [...toml.matchAll(/\[functions\.([\w-]+)\]\s*\nverify_jwt = false/g)].map((m) => m[1]);
  assert.deepEqual(off, ['razorpay-webhook']);
});
