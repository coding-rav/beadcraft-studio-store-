import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoicePdf, money, wrap, type InvoiceData } from '../supabase/functions/_shared/pdf.ts';

const base = (items: InvoiceData['items']): InvoiceData => ({
  invoiceNumber: 'BC-INV-2026-000007', issuedAt: '2026-10-14T05:00:00Z', orderNumber: 'BC-261014-ABC123',
  store: { name: 'Beadcraft Studio', address: '12 Example Street, City 000000', gstin: undefined, email: 'hello@example.com' },
  customer: { name: 'Asha K', email: 'asha@example.com', phone: '9876543210' }, shipTo: ['221B Baker Street', 'Mumbai, Maharashtra 400001'],
  items, subtotalPaise: items.reduce((a, i) => a + i.totalPaise, 0), shippingPaise: 4900, discountPaise: 1000, couponCode: 'WELCOME10',
  totalPaise: items.reduce((a, i) => a + i.totalPaise, 0) + 3900, paymentMethod: 'upi', paymentRef: 'pay_ABC123',
});
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
const item = (n: number) => ({ name: `Handmade bead keychain number ${n}`, sku: `SKU-${n}`, qty: 2, unitPaise: 2900, totalPaise: 5800 });

test('produces a structurally valid PDF with a correct xref table', () => {
  const s = text(buildInvoicePdf(base([item(1), item(2)])));
  assert.ok(s.startsWith('%PDF-1.4')); assert.ok(s.trimEnd().endsWith('%%EOF'));
  const xrefAt = parseInt(/startxref\n(\d+)/.exec(s)![1], 10);
  assert.equal(s.slice(xrefAt, xrefAt + 4), 'xref');
  const entries = [...s.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => parseInt(m[1], 10));
  entries.forEach((off, i) => assert.ok(s.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
});
test('contains invoice number, order number, line items, totals and payment reference', () => {
  const s = text(buildInvoicePdf(base([item(1)])));
  for (const needle of ['BC-INV-2026-000007', 'BC-261014-ABC123', 'Handmade bead keychain number 1', 'SKU-1', 'Rs. 58.00', 'Rs. 49.00', 'WELCOME10', 'pay_ABC123', 'Page 1 of 1'])
    assert.ok(s.includes(needle), needle);
});
test('rupee sign and non-Latin text never corrupt the file', () => {
  const d = base([{ ...item(1), name: 'Rakhi ₹ special – “festive” काँच' }]);
  const b = buildInvoicePdf(d); assert.ok([...b].every((c) => c < 128), 'ASCII only');
  assert.ok(text(b).includes('Rs. special'));
});
test('many items flow onto several pages with page numbers', () => {
  const s = text(buildInvoicePdf(base(Array.from({ length: 70 }, (_, i) => item(i + 1)))));
  const pages = (s.match(/\/Type \/Page /g) ?? []).length;
  assert.ok(pages >= 3, `pages=${pages}`);
  assert.ok(s.includes(`Page ${pages} of ${pages}`)); assert.ok(s.includes('Page 1 of '));
  assert.equal((s.match(/\/Type \/Pages /g) ?? []).length, 1); assert.ok(new RegExp(`/Count ${pages}`).test(s));
});
test('very long product names wrap instead of overflowing', () => {
  const long = 'Super extra long handmade seed bead keychain with a very very long descriptive name '.repeat(4);
  const lines = wrap(long, 270, 10); assert.ok(lines.length > 3);
  assert.equal(lines.join(' ').replace(/\s+/g, ' ').trim(), long.replace(/\s+/g, ' ').trim());
  assert.ok(wrap('x'.repeat(200), 100, 10).length > 1, 'unbroken words are hard-wrapped');
});
test('parentheses and backslashes in names are escaped in PDF strings', () => {
  const s = text(buildInvoicePdf(base([{ ...item(1), name: 'Fox (small) \\ cute' }])));
  assert.ok(s.includes('Fox \\(small\\) \\\\ cute'));
});
test('money formatting uses Indian grouping and two decimals', () => {
  assert.equal(money(12345600), 'Rs. 1,23,456.00'); assert.equal(money(2000), 'Rs. 20.00');
});
