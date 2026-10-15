// Minimal dependency-free PDF writer for invoices (A4, Helvetica, multi-page). ASCII only: "Rs." is used for rupees
// because the standard PDF fonts have no rupee glyph. Pure function: easy to test, no network, no Deno APIs.
export type InvoiceData = {
  invoiceNumber: string; issuedAt: string; orderNumber: string;
  store: { name: string; legalName?: string; address?: string; gstin?: string; email?: string; phone?: string };
  customer: { name: string; email: string; phone: string }; shipTo: string[];
  items: { name: string; sku?: string | null; qty: number; unitPaise: number; totalPaise: number }[];
  subtotalPaise: number; shippingPaise: number; discountPaise: number; couponCode?: string | null; totalPaise: number;
  paymentMethod?: string | null; paymentRef?: string | null;
};

const W = 595, H = 842, M = 50;
export const money = (p: number) => 'Rs. ' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ascii = (s: unknown) => String(s ?? '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u20B9/g, 'Rs.').replace(/[^\x20-\x7E]/g, '?');
const pdfStr = (s: string) => '(' + ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
const CH: Record<string, number> = { ' ': 278, '.': 278, ',': 278, '-': 333, R: 722, s: 500 };
const width = (s: string, size: number, bold = false) => [...ascii(s)].reduce((a, c) => a + (/[0-9]/.test(c) ? 556 : CH[c] ?? (bold ? 620 : 560)), 0) * size / 1000;

export function wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
  const out: string[] = []; let line = '';
  for (const word of ascii(text).split(/\s+/).filter(Boolean)) {
    let w = word;
    while (width(w, size, bold) > maxWidth) {                    // hard-break very long words
      let k = w.length; while (k > 1 && width(w.slice(0, k), size, bold) > maxWidth) k--;
      if (line) { out.push(line); line = ''; }
      out.push(w.slice(0, k)); w = w.slice(k);
    }
    const t = line ? line + ' ' + w : w;
    if (width(t, size, bold) <= maxWidth) line = t; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

export function buildInvoicePdf(d: InvoiceData): Uint8Array {
  const pages: string[][] = [[]]; let y = H - M;
  const ops = () => pages[pages.length - 1];
  const text = (s: string, x: number, yy: number, size = 10, bold = false, right = false) =>
    ops().push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${(right ? x - width(s, size, bold) : x).toFixed(2)} ${yy.toFixed(2)} Td ${pdfStr(s)} Tj ET`);
  const rule = (yy: number) => ops().push(`0.5 w ${M} ${yy.toFixed(2)} m ${W - M} ${yy.toFixed(2)} l S`);
  const newPage = () => { pages.push([]); y = H - M; };
  const need = (h: number) => { if (y - h < 70) { newPage(); return true; } return false; };

  text(d.store.name, M, y, 18, true); text('INVOICE', W - M, y, 14, true, true); y -= 16;
  for (const l of [d.store.legalName, ...(d.store.address ? wrap(d.store.address, 280, 9) : []), d.store.gstin ? 'GSTIN: ' + d.store.gstin : '', d.store.email, d.store.phone].filter(Boolean) as string[]) { text(l, M, y, 9); y -= 11; }
  text('Invoice no: ' + d.invoiceNumber, W - M, H - M - 20, 10, false, true);
  text('Date: ' + new Date(d.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }), W - M, H - M - 32, 10, false, true);
  text('Order: ' + d.orderNumber, W - M, H - M - 44, 10, false, true);
  y = Math.min(y, H - M - 60) - 8; rule(y); y -= 16;

  text('Billed to / Ship to', M, y, 10, true); y -= 13;
  for (const l of [d.customer.name, d.customer.email, d.customer.phone, ...d.shipTo].filter(Boolean)) for (const w of wrap(l, 300, 10)) { text(w, M, y, 10); y -= 12; }
  y -= 8;

  const head = () => { rule(y + 12); text('Item', M, y, 9, true); text('Qty', 360, y, 9, true, true); text('Unit price', 450, y, 9, true, true); text('Amount', W - M, y, 9, true, true); y -= 6; rule(y); y -= 14; };
  head();
  for (const it of d.items) {
    const lines = wrap(it.name + (it.sku ? ` (SKU ${it.sku})` : ''), 270, 10);
    if (need(lines.length * 12 + 6)) head();
    lines.forEach((l, i) => { text(l, M, y - i * 12, 10); });
    text(String(it.qty), 360, y, 10, false, true); text(money(it.unitPaise), 450, y, 10, false, true); text(money(it.totalPaise), W - M, y, 10, false, true);
    y -= lines.length * 12 + 6;
  }
  need(110); rule(y + 4); y -= 12;
  const row = (label: string, v: string, bold = false) => { text(label, 400, y, 10, bold, true); text(v, W - M, y, 10, bold, true); y -= 14; };
  row('Subtotal', money(d.subtotalPaise));
  if (d.discountPaise > 0) row('Discount' + (d.couponCode ? ` (${d.couponCode})` : ''), '-' + money(d.discountPaise));
  row('Shipping', d.shippingPaise ? money(d.shippingPaise) : 'Free');
  row('Total paid (INR)', money(d.totalPaise), true); y -= 6;
  text('Payment: ' + [d.paymentMethod, d.paymentRef].filter(Boolean).join(' / ') , M, y, 9); y -= 12;
  text('Tax is not itemised on this invoice. Prices are as charged at checkout.', M, y, 8);

  // Footers + assemble
  const total = pages.length;
  pages.forEach((p, i) => { p.push(`BT /F1 8 Tf ${M} 30 Td ${pdfStr(`${d.invoiceNumber}  |  Page ${i + 1} of ${total}`)} Tj ET`); });
  const objs: string[] = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const kids: string[] = [];
  pages.forEach((p, i) => {
    const pageNo = 5 + i * 2, contentNo = pageNo + 1; kids.push(`${pageNo} 0 R`);
    const stream = p.join('\n');
    objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNo} 0 R >>`;
    objs[contentNo] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;

  let out = '%PDF-1.4\n'; const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) { offsets[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
