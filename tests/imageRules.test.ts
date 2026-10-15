import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_IMAGE_BYTES, validateImage } from '../src/lib/imageRules.ts';

test('accepts jpg/png/webp within the size limit', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(validateImage({ type, size: 1000 }), null);
  assert.equal(validateImage({ type: 'image/png', size: MAX_IMAGE_BYTES }), null);
});
test('rejects other types, empty and oversized files', () => {
  for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/html', '']) assert.ok(validateImage({ type, size: 10 }), type);
  assert.ok(validateImage({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }));
  assert.ok(validateImage({ type: 'image/png', size: 0 }));
});
