import { buildInvoicePdf } from './pdf.ts';
type Db = any;

/** Issues (once) and renders the invoice PDF into the PRIVATE `invoices` bucket. Idempotent and safe to retry. */
export async function ensureInvoice(db: Db, orderId: string): Promise<{ invoiceNumber: string; path: string }> {
  const { data: inv, error } = await db.rpc('issue_invoice', { p_order: orderId });
  if (error) throw new Error(error.message);
  if (inv.pdf_path) return { invoiceNumber: inv.invoice_number, path: inv.pdf_path };

  const { data: o } = await db.from('orders').select('*, order_items(*)').eq('id', orderId).maybeSingle();
  const { data: row } = await db.from('invoices').select('invoice_number,issued_at,business_snapshot').eq('order_id', orderId).maybeSingle();
  if (!o || !row) throw new Error('order or invoice missing');
  const b = row.business_snapshot ?? {}; const a = o.shipping_address ?? {};
  const pdf = buildInvoicePdf({
    invoiceNumber: row.invoice_number, issuedAt: row.issued_at, orderNumber: o.order_number,
    store: { name: b.store_name ?? 'Beadcraft Studio', legalName: b.legal_name, address: b.address, gstin: b.gstin, email: b.email, phone: b.phone },
    customer: { name: o.customer_name, email: o.customer_email, phone: o.customer_phone },
    shipTo: [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.pincode ? ' ' + a.pincode : '')].filter(Boolean),
    items: (o.order_items ?? []).map((i: any) => ({ name: i.product_name, sku: i.sku, qty: i.quantity, unitPaise: i.unit_price_paise, totalPaise: i.line_total_paise })),
    subtotalPaise: o.subtotal_paise, shippingPaise: o.shipping_fee_paise, discountPaise: o.discount_paise, couponCode: o.coupon_code,
    totalPaise: o.total_paise, paymentMethod: o.payment_method, paymentRef: o.razorpay_payment_id,
  });
  const path = `${orderId}/${row.invoice_number}.pdf`;
  const up = await db.storage.from('invoices').upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  if (up.error && !/already exists|duplicate/i.test(up.error.message)) throw new Error('invoice upload failed');
  await db.rpc('set_invoice_pdf', { p_order: orderId, p_path: path });
  return { invoiceNumber: row.invoice_number, path };
}
