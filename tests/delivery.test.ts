import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDelivery, formatRange } from '../supabase/functions/_shared/delivery.ts';

const from = new Date('2026-10-14T06:00:00Z');
const day = (d: Date) => d.toISOString().slice(0, 10);

test('no estimate is invented when transit days are not configured', () => {
  assert.equal(estimateDelivery(from, null), null);
  assert.equal(estimateDelivery(from, {}), null);
  assert.equal(estimateDelivery(from, { handling_days_min: 2 }), null);
});
test('handling + transit window', () => {
  const r = estimateDelivery(from, { handling_days_min: 1, handling_days_max: 2, transit_days_min: 3, transit_days_max: 5 })!;
  assert.equal(day(r.min), '2026-10-18'); assert.equal(day(r.max), '2026-10-21');
});
test('after dispatch only transit counts', () => {
  const r = estimateDelivery(from, { handling_days_min: 5, transit_days_min: 2, transit_days_max: 4 }, { alreadyDispatched: true })!;
  assert.equal(day(r.min), '2026-10-16'); assert.equal(day(r.max), '2026-10-18');
});
test('rejects nonsense rules', () => {
  assert.equal(estimateDelivery(from, { transit_days_min: 5, transit_days_max: 2 }), null);
  assert.equal(estimateDelivery(from, { transit_days_min: -1 }), null);
});
test('formatRange', () => {
  assert.match(formatRange({ min: new Date('2026-10-18T06:00:00Z'), max: new Date('2026-10-21T06:00:00Z') }), /18 Oct – 21 Oct 2026/);
});
