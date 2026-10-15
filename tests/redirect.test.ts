import test from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirect } from '../src/lib/redirect.ts';

test('allows same-site paths', () => {
  for (const p of ['/checkout', '/account/orders/123', '/?q=fox#shop']) assert.equal(safeRedirect(p), p);
});
test('blocks external and malformed targets', () => {
  for (const p of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/a://b', '', 'checkout', undefined, null, 42])
    assert.equal(safeRedirect(p), '/account', String(p));
});
test('custom fallback', () => assert.equal(safeRedirect('//x', '/'), '/'));
