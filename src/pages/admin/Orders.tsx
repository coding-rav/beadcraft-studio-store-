import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { inr } from '@/lib/money';
import { callFn } from '@/lib/fn';
import { toCsv } from '@/lib/csv';
import { canAdminCancel, canFulfil, canGenerateInvoice, canStartRefund, FULFIL_STATUSES } from '@/lib/orderStatus';
import { cell, errText, input, smallBtn, Table } from './shared';

const PAGE = 25;
const clean = (s: string) => s.replace(/[,()%*\\]/g, '').trim().slice(0, 60);   // keep user text out of PostgREST filter syntax
type F = { q: string; pay: string; ful: string; method: string; courier: string; from: string; to: string; sort: string };
const none: F = { q: '', pay: '', ful: '', method: '', courier: '', from: '', to: '', sort: 'created_desc' };

async function build(f: F) {
  const ship = f.courier ? 'shipments!inner(carrier,tracking_number)' : 'shipments(carrier,tracking_number)';
  let qb = supabase.from('orders').select(`id,order_number,created_at,customer_name,customer_email,total_paise,order_status,payment_status,payment_method,order_items(quantity),${ship}`, { count: 'exact' });
  const q = clean(f.q);
  if (q) {
    const t = await supabase.from('shipments').select('order_id').ilike('tracking_number', `%${q}%`).limit(50);
    const ids = (t.data ?? []).map((r: any) => r.order_id);
    qb = qb.or(`order_number.ilike.%${q}%,customer_email.ilike.%${q}%,customer_name.ilike.%${q}%${ids.length ? `,id.in.(${ids.join(',')})` : ''}`);
  }
  if (f.pay) qb = qb.eq('payment_status', f.pay);
  if (f.ful) qb = qb.eq('order_status', f.ful);
  if (f.method) qb = qb.eq('payment_method', f.method);
  if (f.courier) qb = qb.ilike('shipments.carrier', `%${clean(f.courier)}%`);
  if (f.from) qb = qb.gte('created_at', new Date(f.from).toISOString());
  if (f.to) qb = qb.lte('created_at', new Date(f.to + 'T23:59:59').toISOString());
  const [col, dir] = f.sort.split('_'); return qb.order(col === 'total' ? 'total_paise' : 'created_at', { ascending: dir === 'asc' });
}

export default function Orders() {
  const [f, setF] = useState<F>(none); const [applied, setApplied] = useState<F>(none); const [page, setPage] = useState(0);
  const [rows, setRows] = useState<any[]>([]); const [count, setCount] = useState(0); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const { data, count: c, error } = await (await build(applied)).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) setErr('Could not load orders.'); else { setRows(data ?? []); setCount(c ?? 0); }
    setLoading(false);
  }, [applied, page]);
  useEffect(() => { load(); }, [load]);
  const set = (k: keyof F) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function exportCsv() {
    const { data, error } = await (await build(applied)).limit(5000);
    if (error) return setMsg('Export failed.');
    if (!window.confirm(`Export ${data?.length ?? 0} orders? The file contains customer personal data; store it securely.`)) return;
    const csv = toCsv(['order_number', 'date', 'customer', 'email', 'items', 'total_inr', 'payment_status', 'order_status', 'payment_method', 'courier', 'tracking'],
      (data ?? []).map((o: any) => [o.order_number, o.created_at, o.customer_name, o.customer_email, (o.order_items ?? []).reduce((a: number, i: any) => a + i.quantity, 0), (o.total_paise / 100).toFixed(2), o.payment_status, o.order_status, o.payment_method ?? '', o.shipments?.[0]?.carrier ?? '', o.shipments?.[0]?.tracking_number ?? '']));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = 'orders.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
  const pages = Math.max(1, Math.ceil(count / PAGE));
  return (
    <section aria-label="Orders">
      <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(f); }}>
        <input className={input} placeholder="Order no., name, email or tracking no." aria-label="Search orders" value={f.q} onChange={set('q')} />
        <select className={input} aria-label="Payment status" value={f.pay} onChange={set('pay')}><option value="">All payments</option>{['pending', 'authorized', 'paid', 'failed', 'refunded'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className={input} aria-label="Fulfilment status" value={f.ful} onChange={set('ful')}><option value="">All statuses</option>{['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refund_pending', 'refunded'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className={input} aria-label="Payment method" value={f.method} onChange={set('method')}><option value="">All methods</option>{['upi', 'card', 'netbanking', 'wallet', 'emi', 'paylater'].map((s) => <option key={s}>{s}</option>)}</select>
        <input className={input} placeholder="Courier" aria-label="Courier" value={f.courier} onChange={set('courier')} />
        <input type="date" className={input} aria-label="From date" value={f.from} onChange={set('from')} />
        <input type="date" className={input} aria-label="To date" value={f.to} onChange={set('to')} />
        <select className={input} aria-label="Sort" value={f.sort} onChange={set('sort')}><option value="created_desc">Newest first</option><option value="created_asc">Oldest first</option><option value="total_desc">Total: high to low</option><option value="total_asc">Total: low to high</option></select>
        <div className="flex gap-2"><button className={smallBtn}>Apply filters</button><button type="button" className={smallBtn} onClick={() => { setF(none); setApplied(none); setPage(0); }}>Clear</button><button type="button" className={smallBtn} onClick={exportCsv}>Export CSV</button></div>
      </form>
      <p role="status" className="min-h-[24px] text-sm">{msg}{err}</p>
      {loading ? <p>Loading…</p> : !rows.length ? <p>No orders match.</p> : (
        <Table heads={['Order', 'Customer', 'Date', 'Items', 'Total', 'Payment', 'Status', 'Tracking']}>
          {rows.flatMap((o) => [
            <tr key={o.id}>
              <td className={cell}><button className="underline" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>{o.order_number}</button></td>
              <td className={cell}>{o.customer_name}<br /><small>{o.customer_email}</small></td><td className={cell}>{new Date(o.created_at).toLocaleDateString('en-IN')}</td>
              <td className={cell}>{(o.order_items ?? []).reduce((a: number, i: any) => a + i.quantity, 0)}</td><td className={cell}>{inr(o.total_paise)}</td>
              <td className={cell}>{o.payment_status}{o.payment_method ? <small className="block opacity-60">{o.payment_method}</small> : null}</td><td className={cell}>{o.order_status}</td>
              <td className={cell}>{o.shipments?.[0]?.carrier ?? '—'}<small className="block">{o.shipments?.[0]?.tracking_number}</small></td>
            </tr>,
            open === o.id && <tr key={o.id + 'd'}><td colSpan={8} className={`${cell} bg-[#FFF5F6]`}><Detail id={o.id} order={o} onChanged={load} /></td></tr>])}
        </Table>)}
      <div className="mt-3 flex items-center gap-3 text-sm"><button className={smallBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages} · {count} orders</span><button className={smallBtn} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
    </section>);
}

function Detail({ id, order, onChanged }: { id: string; order: any; onChanged: () => void }) {
  const [d, setD] = useState<any>(null); const [events, setEvents] = useState<any[]>([]); const [refunds, setRefunds] = useState<any[]>([]); const [msg, setMsg] = useState(''); const [note, setNote] = useState(''); const [vis, setVis] = useState(false);
  const load = useCallback(async () => {
    const [o, e, r] = await Promise.all([supabase.from('orders').select('*, order_items(*), shipments(*)').eq('id', id).maybeSingle(),
      supabase.from('order_events').select('*').eq('order_id', id).order('created_at'), supabase.from('refunds').select('*').eq('order_id', id).order('created_at')]);
    setD(o.data); setEvents(e.data ?? []); setRefunds(r.data ?? []);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const done = (m: string) => { setMsg(m); load(); onChanged(); };
  const rpc = async (fn: string, args: object, ok = 'Saved.') => { const { error } = await supabase.rpc(fn, args); done(error ? errText(error) : ok); };

  async function fulfil(status: string) {
    let carrier = null as string | null, tracking = null as string | null, url = null as string | null, eta = null as string | null;
    if (status === 'shipped') {
      carrier = window.prompt('Courier / carrier name (optional)') || null; tracking = window.prompt('Tracking number (optional)') || null;
      url = window.prompt('Tracking link, https://… (optional)') || null; eta = window.prompt('Estimated delivery date from the courier, YYYY-MM-DD (optional)') || null;
      if (url && !/^https?:\/\//i.test(url)) return setMsg('Tracking link must start with https://');
      if (eta && !/^\d{4}-\d{2}-\d{2}$/.test(eta)) return setMsg('Date must look like 2026-10-25');
    } else if (!window.confirm(`Mark this order as ${status.replace(/_/g, ' ')}? The customer is notified for some statuses.`)) return;
    await rpc('admin_set_fulfillment', { p_order: id, p_status: status, p_carrier: carrier, p_tracking: tracking, p_url: url, p_eta: eta });
  }
  async function tracking() {
    const s = (d?.shipments ?? [])[0];
    const carrier = window.prompt('Courier', s?.carrier ?? '') ?? null; if (carrier === null) return;
    const tr = window.prompt('Tracking number', s?.tracking_number ?? '') ?? ''; const url = window.prompt('Tracking link (https://…)', s?.tracking_url ?? '') ?? '';
    const eta = window.prompt('Estimated delivery YYYY-MM-DD (blank for none)', s?.estimated_delivery ?? '') ?? '';
    if (url && !/^https?:\/\//i.test(url)) return setMsg('Tracking link must start with https://');
    await rpc('admin_update_tracking', { p_order: id, p_carrier: carrier, p_tracking: tr, p_url: url, p_eta: eta || null });
  }
  async function cancel() {
    const reason = window.prompt('Reason for cancelling (shown to the customer)'); if (!reason) return;
    if (!window.confirm('Cancel this order? Stock is returned. If it was paid you must then issue a refund.')) return;
    await rpc('admin_cancel_order', { p_order: id, p_reason: reason }, 'Order cancelled.');
  }
  async function refund() {
    const reason = window.prompt('Reason for the refund'); if (!reason) return;
    if (!window.confirm(`Refund ${inr(d.total_paise)} to the customer's original payment method through Razorpay? This cannot be undone.`)) return;
    const r = await callFn('refund-razorpay-payment', { order_id: id, reason }); done(r.error ?? r.data?.message ?? 'Refund requested (pending).');
  }
  async function invoice() {
    const r = await callFn<{ url: string }>('generate-invoice', { order_id: id });
    if (r.error || !r.data?.url) return setMsg(r.error ?? 'Could not prepare the invoice.'); window.open(r.data.url, '_blank', 'noopener');
  }
  async function addNote() { if (!note.trim()) return; await rpc('admin_add_order_note', { p_order: id, p_text: note.trim(), p_visible: vis }, 'Note added.'); setNote(''); }
  if (!d) return <p>Loading…</p>;
  const a = d.shipping_address ?? {}; const s = (d.shipments ?? [])[0];
  return (
    <div className="space-y-3">
      <p><b>Items:</b> {d.order_items.map((i: any) => `${i.product_name}${i.sku ? ` (${i.sku})` : ''} × ${i.quantity} @ ${inr(i.unit_price_paise)}`).join('; ')}</p>
      <p><b>Ship to:</b> {d.customer_name}, {d.customer_phone}, {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}</p>
      <p><b>Amounts:</b> subtotal {inr(d.subtotal_paise)} · shipping {inr(d.shipping_fee_paise)} · discount {inr(d.discount_paise)}{d.coupon_code ? ` (${d.coupon_code})` : ''} · <b>total {inr(d.total_paise)}</b> · tax: not itemised</p>
      <p><b>Razorpay:</b> order {d.razorpay_order_id ?? '—'} · payment {d.razorpay_payment_id ?? '—'} · method {d.payment_method ?? '—'}</p>
      {s && <p><b>Shipment:</b> {s.carrier ?? '—'} · {s.tracking_number ?? '—'} · ETA {s.estimated_delivery ?? '—'}</p>}
      {refunds.map((r) => <p key={r.id}><b>Refund:</b> {inr(r.amount_paise)} · {r.status}{r.failure_reason ? ` (${r.failure_reason})` : ''} · {r.razorpay_refund_id ?? 'awaiting provider id'} {r.status === 'pending' && <span>(stays pending until Razorpay confirms)</span>}</p>)}
      <div className="flex flex-wrap gap-2">
        {FULFIL_STATUSES.filter((st) => canFulfil(d, st)).map((st) => <button key={st} className={smallBtn} onClick={() => fulfil(st)}>{st.replace(/_/g, ' ')}</button>)}
        {s && <button className={smallBtn} onClick={tracking}>Edit tracking</button>}
        {canGenerateInvoice(d) && <button className={smallBtn} onClick={invoice}>Download invoice</button>}
        {canAdminCancel(d) && <button className={smallBtn} onClick={cancel}>Cancel order</button>}
        {canStartRefund(d) && <button className={smallBtn} onClick={refund}>Refund via Razorpay</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} max-w-md`} placeholder="Add a note" aria-label="Order note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <label className="text-xs"><input type="checkbox" checked={vis} onChange={(e) => setVis(e.target.checked)} /> Visible to the customer</label><button className={smallBtn} onClick={addNote}>Add note</button>
      </div>
      <p role="status" className="text-sm">{msg}</p>
      <ol className="space-y-1 border-l-2 border-[#EBD3D8] pl-3 text-xs">{events.map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString('en-IN')} · <b>{e.kind}</b>{e.to_status ? ` → ${e.to_status}` : ''}{e.message ? `: ${e.message}` : ''} {e.customer_visible ? '' : <em>(internal)</em>} {e.actor ? `· ${String(e.actor).slice(0, 8)}` : ''}</li>)}</ol>
    </div>);
}
