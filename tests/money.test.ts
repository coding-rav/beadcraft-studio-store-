import test from 'node:test';
import assert from 'node:assert/strict';
import { inr, paiseToRupeeString, rupeesToPaise, shippingFor } from '../src/lib/money.ts';

test('rupeesToPaise parses valid amounts exactly (no float error)', () => {
  assert.equal(rupeesToPaise('99'), 9900);
  assert.equal(rupeesToPaise('20'), 2000);
  assert.equal(rupeesToPaise('0.29'), 29);
  assert.equal(rupeesToPaise('19.5'), 1950);
  assert.equal(rupeesToPaise('1.10'), 110);          // 1.1*100 = 110.00000000000001 with floats
  assert.equal(rupeesToPaise(' 69.00 '), 6900);
});
test('rupeesToPaise rejects bad input', () => {
  for (const bad of ['', '-5', '1.234', 'abc', '1e3', '12345678', '1,000', '.5']) assert.equal(rupeesToPaise(bad), null, bad);
});
test('inr formats paise as rupees', () => {
  assert.equal(inr(9900), '₹99');
  assert.equal(inr(2950), '₹29.5');
  assert.equal(inr(12345600), '₹1,23,456');
});
test('paiseToRupeeString round-trips', () => {
  assert.equal(paiseToRupeeString(9900), '99');
  assert.equal(paiseToRupeeString(1950), '19.50');
  assert.equal(rupeesToPaise(paiseToRupeeString(6901)), 6901);
});
test('shippingFor: flat fee, waived at threshold, zero when unset', () => {
  assert.equal(shippingFor(10000, null), 0);
  assert.equal(shippingFor(10000, { flat_fee_paise: 4900 }), 4900);
  assert.equal(shippingFor(49899, { flat_fee_paise: 4900, free_threshold_paise: 49900 }), 4900);
  assert.equal(shippingFor(49900, { flat_fee_paise: 4900, free_threshold_paise: 49900 }), 0);
  assert.equal(shippingFor(100, { flat_fee_paise: -5 }), 0);
});
